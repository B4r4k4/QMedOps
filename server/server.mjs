// Salamah · Q-MedOps server: serves the app and a JSON API over a SQLite database.
// Run: node server/server.mjs   (Node 22.5+; uses the built-in node:sqlite, no dependencies)
// Env: PORT (default 8080), DB_PATH (default server/data/salamah.db)
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdirSync, existsSync, statSync, createReadStream} from 'node:fs';
import {dirname, join, resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = +process.env.PORT || 8080;
const DB_PATH = resolve(process.env.DB_PATH || join(HERE, 'data', 'salamah.db'));
mkdirSync(dirname(DB_PATH), {recursive: true});

/* app collection name → table */
const TABLES = {users: 'users', depts: 'depts', types: 'types', incidents: 'incidents', rca: 'rca', capa: 'capa', kpis: 'kpis',
  kpiValues: 'kpi_values', standards: 'standards', devices: 'devices', maint: 'maint', audit: 'audit', comments: 'comments'};
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

function upsert(col, doc, rev) {
  db.prepare(`INSERT INTO ${TABLES[col]} (id, data, rev, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at`).run(String(doc.id), JSON.stringify(doc), rev, now());
  db.prepare('DELETE FROM deleted WHERE col = ? AND id = ?').run(col, String(doc.id));
}

function snapshot() {
  const out = {epoch: epoch(), rev: curRev(), meta: (kvGet('meta') || {}).value || null, settings: (kvGet('settings') || {}).value || null, prefs: {}};
  for (const c of COLS) out[c] = db.prepare(`SELECT data FROM ${TABLES[c]}`).all().map(r => JSON.parse(r.data));
  for (const p of db.prepare('SELECT user_id, key, value FROM user_prefs').all()) out.prefs[`${p.user_id}|${p.key}`] = JSON.parse(p.value);
  return out;
}

function changes(since) {
  const out = {epoch: epoch(), rev: curRev(), docs: [], deleted: [], prefs: {}, settings: null};
  for (const c of COLS) for (const r of db.prepare(`SELECT data FROM ${TABLES[c]} WHERE rev > ?`).all(since)) out.docs.push({col: c, doc: JSON.parse(r.data)});
  out.deleted = db.prepare('SELECT col, id FROM deleted WHERE rev > ?').all(since).map(r => ({col: r.col, id: r.id}));
  for (const p of db.prepare('SELECT user_id, key, value FROM user_prefs WHERE rev > ?').all(since)) out.prefs[`${p.user_id}|${p.key}`] = JSON.parse(p.value);
  const s = kvGet('settings'); if (s && s.rev > since) out.settings = s.value;
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
    for (const c of COLS) for (const d of body[c] || []) upsert(c, d, rev);
    kvSet('settings', body.settings || {}, rev); kvSet('meta', body.meta || {version: 1}, rev); kvSet('epoch', epoch() + 1, rev);
    return true;
  });
}

/* ---------- HTTP ---------- */
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'};
const STATIC_OK = /^\/(index\.html|styles\.css|platform\.css|js\/[\w.-]+\.js)?$/; // only the app itself is served
const MAX_BODY = 25 * 1048576;

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, {'Content-Type': type, 'Cache-Control': 'no-store'}); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const readBody = req => new Promise((ok, fail) => { const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > MAX_BODY) { fail(Object.assign(new Error('payload too large'), {code: 413})); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', fail); });
const json = async req => { const b = await readBody(req); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw Object.assign(new Error('invalid JSON'), {code: 400}); } };

async function api(req, res, parts, url) {
  const [a, b, c] = parts, m = req.method;
  if (a === 'health') return send(res, 200, {ok: true, rev: curRev(), empty: isEmpty()});
  if (a === 'data' && m === 'GET') return send(res, 200, isEmpty() ? {empty: true, epoch: epoch()} : snapshot());
  if (a === 'changes' && m === 'GET') return send(res, 200, changes(+url.searchParams.get('since') || 0));
  if (a === 'import' && m === 'POST') { const body = await json(req); const ok = importAll(body, url.searchParams.get('force') === '1'); return ok ? send(res, 200, {ok: true, rev: curRev(), epoch: epoch()}) : send(res, 409, {error: 'database already initialised'}); }
  if (a === 'settings' && m === 'PUT') { const body = await json(req); const rev = tx(() => { const r = nextRev(); kvSet('settings', body, r); return r; }); return send(res, 200, {ok: true, rev}); }
  if (a === 'prefs' && b && c && m === 'PUT') { const body = await json(req);
    const rev = tx(() => { const r = nextRev(); db.prepare('INSERT INTO user_prefs (user_id, key, value, rev) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, rev = excluded.rev').run(b, c, JSON.stringify(body.value ?? null), r); return r; });
    return send(res, 200, {ok: true, rev}); }
  if (a === 'files' && b) {
    if (m === 'PUT') { const data = await readBody(req); db.prepare('INSERT OR REPLACE INTO files (id, name, type, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(b, decodeURIComponent(req.headers['x-file-name'] || ''), req.headers['content-type'] || 'application/octet-stream', data.length, data, now()); return send(res, 200, {ok: true}); }
    if (m === 'GET') { const f = db.prepare('SELECT type, data FROM files WHERE id = ?').get(b); if (!f) return send(res, 404, {error: 'not found'}); res.writeHead(200, {'Content-Type': f.type || 'application/octet-stream', 'Cache-Control': 'no-store'}); return res.end(Buffer.from(f.data)); }
    if (m === 'DELETE') { db.prepare('DELETE FROM files WHERE id = ?').run(b); return send(res, 200, {ok: true}); }
  }
  if (a === 'c' && TABLES[b] && c) {
    const id = decodeURIComponent(c);
    if (m === 'PUT') { const doc = await json(req); if (String(doc.id) !== id) return send(res, 400, {error: 'id mismatch'}); const rev = tx(() => { const r = nextRev(); upsert(b, doc, r); return r; }); return send(res, 200, {ok: true, rev}); }
    if (m === 'DELETE') { const rev = tx(() => { const r = nextRev(); db.prepare(`DELETE FROM ${TABLES[b]} WHERE id = ?`).run(id); db.prepare('INSERT OR REPLACE INTO deleted (col, id, rev) VALUES (?, ?, ?)').run(b, id, r); return r; }); return send(res, 200, {ok: true, rev}); }
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
