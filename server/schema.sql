-- Salamah · Q-MedOps SQLite schema
-- Every record keeps its full document in `data` (JSON). Columns used for filtering, joins and
-- reporting are generated from that JSON and indexed, so the app and SQL always agree.
-- `rev` is a global change counter used by clients to sync changes from other users.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS kv (            -- settings, app meta, global revision, data epoch
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  rev   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  role    TEXT GENERATED ALWAYS AS (json_extract(data, '$.role')) VIRTUAL,
  dept_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.deptId')) VIRTUAL,
  email   TEXT GENERATED ALWAYS AS (lower(json_extract(data, '$.email'))) VIRTUAL,
  name_ar TEXT GENERATED ALWAYS AS (json_extract(data, '$.name.ar')) VIRTUAL,
  name_en TEXT GENERATED ALWAYS AS (json_extract(data, '$.name.en')) VIRTUAL,
  active  INTEGER GENERATED ALWAYS AS (coalesce(json_extract(data, '$.active'), 1)) VIRTUAL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role, dept_id);

CREATE TABLE IF NOT EXISTS depts (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  name_ar TEXT GENERATED ALWAYS AS (json_extract(data, '$.name.ar')) VIRTUAL,
  name_en TEXT GENERATED ALWAYS AS (json_extract(data, '$.name.en')) VIRTUAL,
  head_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.headId')) VIRTUAL
);

CREATE TABLE IF NOT EXISTS types (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  cat     TEXT GENERATED ALWAYS AS (json_extract(data, '$.cat')) VIRTUAL,
  name_en TEXT GENERATED ALWAYS AS (json_extract(data, '$.name.en')) VIRTUAL
);

CREATE TABLE IF NOT EXISTS incidents (      -- OVR reports
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  dept_id      TEXT GENERATED ALWAYS AS (json_extract(data, '$.deptId')) VIRTUAL,
  type_id      TEXT GENERATED ALWAYS AS (json_extract(data, '$.typeId')) VIRTUAL,
  stage        TEXT GENERATED ALWAYS AS (json_extract(data, '$.stage')) VIRTUAL,
  reporter_id  TEXT GENERATED ALWAYS AS (json_extract(data, '$.reporterId')) VIRTUAL,
  occurred_at  TEXT GENERATED ALWAYS AS (json_extract(data, '$.occurredAt')) VIRTUAL,
  reported_at  TEXT GENERATED ALWAYS AS (json_extract(data, '$.reportedAt')) VIRTUAL,
  severity     INTEGER GENERATED ALWAYS AS (json_extract(data, '$.review.sev')) VIRTUAL,
  likelihood   INTEGER GENERATED ALWAYS AS (json_extract(data, '$.review.lik')) VIRTUAL,
  sal          INTEGER GENERATED ALWAYS AS (json_extract(data, '$.review.sev') * json_extract(data, '$.review.lik')) VIRTUAL,
  class        TEXT GENERATED ALWAYS AS (json_extract(data, '$.review.classification')) VIRTUAL,
  owner_id     TEXT GENERATED ALWAYS AS (json_extract(data, '$.review.ownerId')) VIRTUAL,
  rca_id       TEXT GENERATED ALWAYS AS (json_extract(data, '$.rcaId')) VIRTUAL,
  device_tag   TEXT GENERATED ALWAYS AS (json_extract(data, '$.deviceTag')) VIRTUAL,
  closed_at    TEXT GENERATED ALWAYS AS (json_extract(data, '$.closure.at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_inc_dept_stage ON incidents(dept_id, stage);
CREATE INDEX IF NOT EXISTS ix_inc_reporter ON incidents(reporter_id);
CREATE INDEX IF NOT EXISTS ix_inc_reported ON incidents(reported_at);
CREATE INDEX IF NOT EXISTS ix_inc_rca ON incidents(rca_id);
CREATE INDEX IF NOT EXISTS ix_inc_device ON incidents(device_tag);

CREATE TABLE IF NOT EXISTS rca (            -- root cause analyses
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  incident_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.incidentId')) VIRTUAL,
  lead_id     TEXT GENERATED ALWAYS AS (json_extract(data, '$.leadId')) VIRTUAL,
  status      TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  meeting_at  TEXT GENERATED ALWAYS AS (json_extract(data, '$.meetingAt')) VIRTUAL,
  approved_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.approvedAt')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_rca_incident ON rca(incident_id);

CREATE TABLE IF NOT EXISTS capa (           -- corrective & preventive actions
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  incident_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.incidentId')) VIRTUAL,
  rca_id      TEXT GENERATED ALWAYS AS (json_extract(data, '$.rcaId')) VIRTUAL,
  owner_id    TEXT GENERATED ALWAYS AS (json_extract(data, '$.ownerId')) VIRTUAL,
  dept_id     TEXT GENERATED ALWAYS AS (json_extract(data, '$.deptId')) VIRTUAL,
  status      TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  due         TEXT GENERATED ALWAYS AS (json_extract(data, '$.due')) VIRTUAL,
  progress    INTEGER GENERATED ALWAYS AS (json_extract(data, '$.progress')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_capa_owner ON capa(owner_id, status);
CREATE INDEX IF NOT EXISTS ix_capa_incident ON capa(incident_id);
CREATE INDEX IF NOT EXISTS ix_capa_due ON capa(status, due);

CREATE TABLE IF NOT EXISTS kpis (           -- indicator definitions
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  code    TEXT GENERATED ALWAYS AS (json_extract(data, '$.code')) VIRTUAL,
  dept_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.deptId')) VIRTUAL,
  unit    TEXT GENERATED ALWAYS AS (json_extract(data, '$.unit')) VIRTUAL,
  target  REAL GENERATED ALWAYS AS (json_extract(data, '$.target')) VIRTUAL,
  name_en TEXT GENERATED ALWAYS AS (json_extract(data, '$.name.en')) VIRTUAL
);

CREATE TABLE IF NOT EXISTS kpi_values (     -- monthly numerator / denominator, id = kpiId:YYYY-MM
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  kpi_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.kpiId')) VIRTUAL,
  month  TEXT GENERATED ALWAYS AS (json_extract(data, '$.month')) VIRTUAL,
  num    REAL GENERATED ALWAYS AS (json_extract(data, '$.num')) VIRTUAL,
  den    REAL GENERATED ALWAYS AS (json_extract(data, '$.den')) VIRTUAL,
  by_id  TEXT GENERATED ALWAYS AS (json_extract(data, '$.by')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_kv_kpi_month ON kpi_values(kpi_id, month);

CREATE TABLE IF NOT EXISTS standards (      -- CBAHI standards with their measurable elements
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  chapter  TEXT GENERATED ALWAYS AS (json_extract(data, '$.chapter')) VIRTUAL,
  priority TEXT GENERATED ALWAYS AS (json_extract(data, '$.priority')) VIRTUAL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  dept_id   TEXT GENERATED ALWAYS AS (json_extract(data, '$.deptId')) VIRTUAL,
  status    TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  model     TEXT GENERATED ALWAYS AS (json_extract(data, '$.model')) VIRTUAL,
  last_pm   TEXT GENERATED ALWAYS AS (json_extract(data, '$.lastPM')) VIRTUAL,
  pm_months INTEGER GENERATED ALWAYS AS (json_extract(data, '$.pmMonths')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_dev_dept ON devices(dept_id, status);

CREATE TABLE IF NOT EXISTS maint (          -- device maintenance log
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  device_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.deviceId')) VIRTUAL,
  kind      TEXT GENERATED ALWAYS AS (json_extract(data, '$.kind')) VIRTUAL,
  at        TEXT GENERATED ALWAYS AS (json_extract(data, '$.at')) VIRTUAL,
  result    TEXT GENERATED ALWAYS AS (json_extract(data, '$.result')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_maint_device ON maint(device_id, at);

CREATE TABLE IF NOT EXISTS audit (          -- audit trail
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  entity TEXT GENERATED ALWAYS AS (json_extract(data, '$.entity')) VIRTUAL,
  ref    TEXT GENERATED ALWAYS AS (json_extract(data, '$.ref')) VIRTUAL,
  action TEXT GENERATED ALWAYS AS (json_extract(data, '$.action')) VIRTUAL,
  by_id  TEXT GENERATED ALWAYS AS (json_extract(data, '$.by')) VIRTUAL,
  at     TEXT GENERATED ALWAYS AS (json_extract(data, '$.at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_audit_ref ON audit(ref, at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), rev INTEGER NOT NULL, updated_at TEXT NOT NULL,
  ref   TEXT GENERATED ALWAYS AS (json_extract(data, '$.ref')) VIRTUAL,
  by_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.by')) VIRTUAL,
  at    TEXT GENERATED ALWAYS AS (json_extract(data, '$.at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS ix_comments_ref ON comments(ref, at);

CREATE TABLE IF NOT EXISTS files (          -- attachments and CBAHI evidence
  id         TEXT PRIMARY KEY,
  name       TEXT,
  type       TEXT,
  size       INTEGER,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_prefs (     -- per-user state shared across devices (e.g. seen notifications)
  user_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL CHECK (json_valid(value)),
  rev     INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS deleted (        -- tombstones so other clients drop deleted records
  col TEXT NOT NULL,
  id  TEXT NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (col, id)
);

-- ---------- reporting views ----------
CREATE VIEW IF NOT EXISTS v_incidents AS
SELECT i.id, i.stage, i.reported_at, i.occurred_at, i.sal, i.class,
       d.name_en AS department, t.name_en AS type, u.name_en AS reporter, o.name_en AS owner,
       i.rca_id, i.device_tag, i.closed_at,
       json_extract(i.data, '$.title.en') AS title
FROM incidents i
LEFT JOIN depts d ON d.id = i.dept_id
LEFT JOIN types t ON t.id = i.type_id
LEFT JOIN users u ON u.id = i.reporter_id
LEFT JOIN users o ON o.id = i.owner_id;

CREATE VIEW IF NOT EXISTS v_capa AS
SELECT c.id, c.status, c.due, c.progress, c.incident_id, c.rca_id,
       u.name_en AS owner, d.name_en AS department,
       CASE WHEN c.status IN ('open', 'progress') AND c.due < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END AS overdue,
       json_extract(c.data, '$.title') AS title
FROM capa c
LEFT JOIN users u ON u.id = c.owner_id
LEFT JOIN depts d ON d.id = c.dept_id;

CREATE VIEW IF NOT EXISTS v_kpi_monthly AS
SELECT k.code, k.name_en AS indicator, d.name_en AS department, v.month, v.num, v.den,
       CASE k.unit WHEN 'pct' THEN round(v.num * 100.0 / nullif(v.den, 0), 2)
                   WHEN 'per1000' THEN round(v.num * 1000.0 / nullif(v.den, 0), 2)
                   WHEN 'count' THEN v.num
                   ELSE round(v.num * 1.0 / nullif(v.den, 0), 2) END AS value,
       k.target
FROM kpi_values v
JOIN kpis k ON k.id = v.kpi_id
LEFT JOIN depts d ON d.id = k.dept_id;
