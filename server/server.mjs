// Salamah · Q-MedOps server: serves the app and a JSON API over a SQLite database.
// Run: node server/server.mjs   (Node 22.5+; uses the built-in node:sqlite, no dependencies)
// Env: PORT (default 8080), DB_PATH (default server/data/salamah.db), DEMO_LOGIN=0 disables demo accounts (use in production)
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdirSync, existsSync, statSync, createReadStream} from 'node:fs';
import {dirname, join, resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import {context, visible, writeError, can} from './access.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = +process.env.PORT || 8080;
const DB_PATH = resolve(process.env.DB_PATH || join(HERE, 'data', 'salamah.db'));
mkdirSync(dirname(DB_PATH), {recursive: true});

/* app collection name → table */
const TABLES = {users: 'users', depts: 'depts', types: 'types', incidents: 'incidents', rca: 'rca', capa: 'capa', kpis: 'kpis',
  kpiValues: 'kpi_values', standards: 'standards', devices: 'devices', maint: 'maint', audit: 'audit', comments: 'comments',
  policies: 'policies', complaints: 'complaints', checklists: 'checklists', rounds: 'rounds',
  risks: 'risks', fmeas: 'fmeas', surveys: 'surveys', responses: 'responses', committees: 'committees', meetings: 'meetings', extreports: 'extreports', mocks: 'mocks', drills: 'drills',
  records: 'records', projects: 'projects', plans: 'plans'};
const COLS = Object.keys(TABLES);

const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(join(HERE, 'schema.sql'), 'utf8'));

const kvGet = k => { const r = db.prepare('SELECT value, rev FROM kv WHERE key = ?').get(k); return r ? {value: JSON.parse(r.value), rev: r.rev} : null; };
const kvSet = (k, v, rev) => db.prepare('INSERT INTO kv (key, value, rev) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, rev = excluded.rev').run(k, JSON.stringify(v), rev);
const curRev = () => (kvGet('rev') || {value: 0}).value;
const nextRev = () => { const r = curRev() + 1; kvSet('rev', r, r); return r; };
const epoch = () => (kvGet('epoch') || {value: 1}).value;
const isEmpty = () => !kvGet('meta');
const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const now = () => new Date().toISOString();

/* ---------- authentication: the server checks passwords and issues session tokens ----------
   Demo accounts (no own password) sign in with "demo" or one click. Set DEMO_LOGIN=0 in production to switch that off. */
const DEMO = process.env.DEMO_LOGIN !== '0';
const SESSION_MS = 12 * 3600e3;
const sessions = new Map();                 // token → {userId, role, deptId, exp}
const fails = new Map();                    // ip → {n, until}
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const getUser = id => { const r = db.prepare('SELECT data FROM users WHERE id = ?').get(String(id)); return r && JSON.parse(r.data); };
const userByEmail = e => { const r = db.prepare('SELECT data FROM users WHERE email = ?').get(String(e || '').trim().toLowerCase()); return r && JSON.parse(r.data); };
const passwordOk = (u, pw) => u.pwHash ? sha(`${u.id}:${pw}`) === u.pwHash : DEMO && pw === 'demo';
const issue = u => { const token = randomBytes(32).toString('hex'); sessions.set(token, {userId: u.id, role: u.role, deptId: u.deptId, exp: Date.now() + SESSION_MS}); return token; };
const sessionOf = req => { const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || ''); const s = m && sessions.get(m[1]);
  if (!s) return null; if (s.exp < Date.now()) { sessions.delete(m[1]); return null; }
  const u = getUser(s.userId); if (!u || u.active === false) { sessions.delete(m[1]); return null; } s.user = u; s.role = u.role; s.deptId = u.deptId; s.exp = Date.now() + SESSION_MS; s.token = m[1]; return s; };
/* password hashes never leave the server: clients only learn that an account has its own password */
const hideHash = d => d && d.pwHash ? Object.assign({}, d, {pwHash: true}) : d;
/* a client sending pwHash: true means "unchanged"; only a real 64-hex hash replaces the stored one */
const keepHash = doc => { if (doc && doc.pwHash === true) { const old = getUser(doc.id); doc.pwHash = old && typeof old.pwHash === 'string' ? old.pwHash : undefined; } return doc; };
/* role-based access on the server: each user receives only what their role may see, and every save is checked (server/access.mjs) */
const loadAll = col => db.prepare(`SELECT data FROM ${TABLES[col]}`).all().map(r => JSON.parse(r.data));
const ctxFor = s => { const cache = {}; return context(s.user, col => cache[col] || (cache[col] = loadAll(col))); };

function upsert(col, doc, rev) {
  db.prepare(`INSERT INTO ${TABLES[col]} (id, data, rev, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at`).run(String(doc.id), JSON.stringify(doc), rev, now());
  db.prepare('DELETE FROM deleted WHERE col = ? AND id = ?').run(col, String(doc.id));
}

function snapshot(s) {
  const out = {epoch: epoch(), rev: curRev(), meta: (kvGet('meta') || {}).value || null, settings: (kvGet('settings') || {}).value || null, prefs: {}, hiddenIds: {}};
  const ctx = ctxFor(s);
  for (const c of COLS) { const all = ctx.map(c), vis = []; const hid = [];
    for (const d of all.values()) (visible(ctx, c, d) ? vis : hid).push(d);
    out[c] = vis.map(d => c === 'users' ? hideHash(d) : d);
    /* ids only (no content) of records this user cannot see, so new numbers never collide with them */
    if (hid.length) out.hiddenIds[c] = hid.map(d => String(d.id)); }
  for (const p of db.prepare('SELECT user_id, key, value FROM user_prefs WHERE user_id = ?').all(s.userId)) out.prefs[`${p.user_id}|${p.key}`] = JSON.parse(p.value);
  return out;
}

function changes(since, s) {
  const out = {epoch: epoch(), rev: curRev(), docs: [], deleted: [], hidden: [], prefs: {}, settings: null};
  let ctx = null;
  for (const c of COLS) for (const r of db.prepare(`SELECT data FROM ${TABLES[c]} WHERE rev > ?`).all(since)) { const d = JSON.parse(r.data); ctx = ctx || ctxFor(s);
    /* a record that is (or became) hidden is sent as an id only, so the page drops any stale copy and still avoids its number */
    if (visible(ctx, c, d)) out.docs.push({col: c, doc: c === 'users' ? hideHash(d) : d}); else out.hidden.push({col: c, id: String(d.id)}); }
  out.deleted = db.prepare('SELECT col, id FROM deleted WHERE rev > ?').all(since).map(r => ({col: r.col, id: r.id}));
  for (const p of db.prepare('SELECT user_id, key, value FROM user_prefs WHERE rev > ? AND user_id = ?').all(since, s.userId)) out.prefs[`${p.user_id}|${p.key}`] = JSON.parse(p.value);
  const st = kvGet('settings'); if (st && st.rev > since) out.settings = st.value;
  return out;
}

/* replace the whole dataset (first seed, restore from backup, demo reset) */
function importAll(body, force) {
  return tx(() => {
    if (!force && !isEmpty()) return false;
    for (const c of COLS) db.exec(`DELETE FROM ${TABLES[c]}`);
    db.exec('DELETE FROM deleted'); if (body.resetPrefs) db.exec('DELETE FROM user_prefs');
    if (body.resetFiles) db.exec('DELETE FROM files');
    const rev = nextRev();
    const hashes = Object.fromEntries(db.prepare('SELECT data FROM users').all().map(r => JSON.parse(r.data)).filter(u => typeof u.pwHash === 'string').map(u => [u.id, u.pwHash]));
    for (const c of COLS) for (const d of body[c] || []) { if (c === 'users' && d.pwHash === true) d.pwHash = hashes[d.id]; upsert(c, d, rev); }
    kvSet('settings', body.settings || {}, rev); kvSet('meta', body.meta || {version: 1}, rev); kvSet('epoch', epoch() + 1, rev);
    return true;
  });
}

/* ---------- HTTP ---------- */
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'};
const STATIC_OK = /^\/(index\.html|styles\.css|platform\.css|js\/[\w.-]+\.js|assets\/[\w.-]+\.(?:png|jpg|jpeg|webp|svg))?$/; // only approved app assets are served
const MAX_BODY = 25 * 1048576;

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, {'Content-Type': type, 'Cache-Control': 'no-store'}); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const readBody = req => new Promise((ok, fail) => { const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > MAX_BODY) { fail(Object.assign(new Error('payload too large'), {code: 413})); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', fail); });
const json = async req => { const b = await readBody(req); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw Object.assign(new Error('invalid JSON'), {code: 400}); } };

async function api(req, res, parts, url) {
  const [a, b, c] = parts, m = req.method;
  if (a === 'health') return send(res, 200, {ok: true, rev: curRev(), empty: isEmpty()});
  /* sign-in, rate-limited per address */
  if (a === 'login' && m === 'POST') { const body = await json(req), u = body.userId ? getUser(body.userId) : userByEmail(body.email);
    /* throttle per address + account, so one person guessing passwords cannot lock out a whole hospital behind one NAT address */
    const ip = (req.socket.remoteAddress || '?') + '|' + String(body.userId || body.email || '').toLowerCase(), f = fails.get(ip);
    if (f && f.until > Date.now()) return send(res, 429, {error: 'too many attempts, try again in a few minutes'});
    const ok = !!u && u.active !== false && (body.demo ? DEMO && !u.pwHash : passwordOk(u, String(body.password || '')));
    if (!ok) { const n = (f && f.until && f.until <= Date.now() ? 0 : (f ? f.n : 0)) + 1; fails.set(ip, {n, until: n >= 8 ? Date.now() + 10 * 60e3 : 0}); return send(res, 401, {error: 'invalid credentials'}); }
    fails.delete(ip); return send(res, 200, {token: issue(u), userId: u.id}); }
  /* before sign-in: demo accounts to list on the login page, or "empty" so the first client seeds the database */
  if (a === 'public' && b === 'accounts' && m === 'GET') { if (isEmpty()) return send(res, 200, {empty: true});
    const all = db.prepare('SELECT data FROM users').all().map(r => JSON.parse(r.data)).filter(u => u.active !== false && !u.pwHash);
    return send(res, 200, {demo: DEMO, users: DEMO ? all.map(u => ({id: u.id, name: u.name, role: u.role, deptId: u.deptId, email: u.email, active: true})) : [],
      depts: db.prepare('SELECT data FROM depts').all().map(r => { const d = JSON.parse(r.data); return {id: d.id, name: d.name, short: d.short}; }), settings: {facility: ((kvGet('settings') || {}).value || {}).facility || null}}); }
  /* first run only: an empty database may be seeded without a session */
  if (a === 'import' && m === 'POST' && url.searchParams.get('force') !== '1') { if (!isEmpty()) return send(res, 409, {error: 'database already initialised'}); importAll(await json(req), false); return send(res, 200, {ok: true, rev: curRev(), epoch: epoch()}); }
  /* everything below needs a valid session */
  const S = a === 'public' ? null : sessionOf(req);
  if (a !== 'public' && !S) return send(res, 401, {error: 'sign in required'});
  if (a === 'session' && m === 'GET') return send(res, 200, {userId: S.userId});
  if (a === 'logout' && m === 'POST') { sessions.delete(S.token); return send(res, 200, {ok: true}); }
  if (a === 'verify' && m === 'POST') { const body = await json(req), u = getUser(S.userId), ok = !!u && passwordOk(u, String(body.password || '')); return send(res, ok ? 200 : 401, {ok}); }
  if (a === 'data' && m === 'GET') return send(res, 200, snapshot(S));
  if (a === 'changes' && m === 'GET') return send(res, 200, changes(+url.searchParams.get('since') || 0, S));
  if (a === 'import' && m === 'POST') { if (!['admin', 'director'].includes(S.role)) return send(res, 403, {error: 'only an administrator can replace the whole dataset'});
    importAll(await json(req), true); return send(res, 200, {ok: true, rev: curRev(), epoch: epoch()}); }
  if (a === 'settings' && m === 'PUT' && !can(S.user, 'admin')) return send(res, 403, {error: 'only an administrator can change settings'});
  if (a === 'settings' && m === 'PUT') { const body = await json(req); const rev = tx(() => { const r = nextRev(); kvSet('settings', body, r); return r; }); return send(res, 200, {ok: true, rev}); }
  if (a === 'prefs' && b && c && m === 'PUT') { if (decodeURIComponent(b) !== S.userId) return send(res, 403, {error: 'not your preferences'}); const body = await json(req);
    const rev = tx(() => { const r = nextRev(); db.prepare('INSERT INTO user_prefs (user_id, key, value, rev) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, rev = excluded.rev').run(b, c, JSON.stringify(body.value ?? null), r); return r; });
    return send(res, 200, {ok: true, rev}); }
  if (a === 'files' && b) {
    if (m === 'PUT') { const data = await readBody(req); db.prepare('INSERT OR REPLACE INTO files (id, name, type, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(b, decodeURIComponent(req.headers['x-file-name'] || ''), req.headers['content-type'] || 'application/octet-stream', data.length, data, now()); return send(res, 200, {ok: true}); }
    if (m === 'GET') { const f = db.prepare('SELECT type, data FROM files WHERE id = ?').get(b); if (!f) return send(res, 404, {error: 'not found'}); res.writeHead(200, {'Content-Type': f.type || 'application/octet-stream', 'Cache-Control': 'no-store'}); return res.end(Buffer.from(f.data)); }
    if (m === 'DELETE') { db.prepare('DELETE FROM files WHERE id = ?').run(b); return send(res, 200, {ok: true}); }
  }
  /* public survey endpoints: the only data a patient's browser ever receives is one open survey and the unit names */
  if (a === 'public') {
    if (b === 'survey' && c && m === 'GET') {
      const row = db.prepare('SELECT data FROM surveys WHERE id = ?').get(decodeURIComponent(c)); const s = row && JSON.parse(row.data);
      if (!s || s.status !== 'open') return send(res, 404, {error: 'not available'});
      const depts = db.prepare('SELECT id, name_ar, name_en FROM depts').all().filter(d => !['qps', 'biomed', 'it'].includes(d.id)).map(d => ({id: d.id, name: {ar: d.name_ar, en: d.name_en}}));
      const settings = (kvGet('settings') || {}).value || {};
      return send(res, 200, {survey: {id: s.id, kind: s.kind, title: s.title, status: s.status, items: s.items || null, dimensions: s.dimensions || null}, depts, facility: settings.facility || null});
    }
    if (b === 'response' && m === 'POST') {
      const body = await json(req); const row = db.prepare('SELECT data FROM surveys WHERE id = ?').get(String(body.surveyId || '')); const s = row && JSON.parse(row.data);
      if (!s || s.status !== 'open') return send(res, 404, {error: 'not available'});
      const ids = (s.kind === 'culture' ? (s.dimensions || []).flatMap(d => d.items) : (s.items || [])).map(i => i.id), answers = {};
      for (const id of ids) { const v = Number((body.answers || {})[id]); if (!Number.isInteger(v) || v < 1 || v > 5) return send(res, 400, {error: 'every question needs an answer from 1 to 5'}); answers[id] = v; }
      const str = (v, n) => String(v == null ? '' : v).slice(0, n);
      const doc = {id: 'rs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), refId: s.id, kind: s.kind, deptId: s.kind === 'patient' ? str(body.deptId, 40) : null, visitType: s.kind === 'patient' ? str(body.visitType, 20) : null,
        answers, comment: str(body.comment, 1000), contact: s.kind === 'patient' ? str(body.contact, 40) : '', at: now()};
      if (s.kind === 'patient' && !db.prepare('SELECT 1 FROM depts WHERE id = ?').get(doc.deptId)) return send(res, 400, {error: 'unknown unit'});
      const rev = tx(() => { const r = nextRev(); upsert('responses', doc, r); return r; }); return send(res, 200, {ok: true, rev});
    }
    return send(res, 404, {error: 'unknown endpoint'});
  }
  if (a === 'c' && TABLES[b] && c) {
    const id = decodeURIComponent(c);
    const ctx = ctxFor(S), old = ctx.map(b).get(id) || null;
    if (m === 'PUT') { const doc = await json(req); if (String(doc.id) !== id) return send(res, 400, {error: 'id mismatch'});
      /* a new number that collides with a record this user cannot see is refused, never silently overwritten */
      const why = writeError(ctx, b, old, doc); if (why) return send(res, old && !visible(ctx, b, old) ? 409 : 403, {error: why});
      if (b === 'users') keepHash(doc); const rev = tx(() => { const r = nextRev(); upsert(b, doc, r); return r; }); return send(res, 200, {ok: true, rev}); }
    if (m === 'DELETE') { if (!old) return send(res, 200, {ok: true, rev: curRev()}); const why = writeError(ctx, b, old, null); if (why) return send(res, 403, {error: why});
      const rev = tx(() => { const r = nextRev(); db.prepare(`DELETE FROM ${TABLES[b]} WHERE id = ?`).run(id); db.prepare('INSERT OR REPLACE INTO deleted (col, id, rev) VALUES (?, ?, ?)').run(b, id, r); return r; }); return send(res, 200, {ok: true, rev}); }
  }
  return send(res, 404, {error: 'unknown endpoint'});
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname.slice(5).split('/').filter(Boolean), url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {error: 'method not allowed'});
    if (!STATIC_OK.test(url.pathname)) return send(res, 404, 'Not found', 'text/plain');
    const file = resolve(ROOT, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, {'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    createReadStream(file).pipe(res);
  } catch (e) { if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, {error: e.message}); else res.end(); }
}).listen(PORT, () => console.log(`Salamah server on http://localhost:${PORT}  ·  SQLite: ${DB_PATH}`));
