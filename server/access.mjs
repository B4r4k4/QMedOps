// Server-side access control: which records a signed-in user may receive, and which saves they may make.
// Mirrors the page's rules (js/core.js canSee*), reading the same permission table (js/perms.js).
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const sandbox = {globalThis: {}};
runInNewContext(readFileSync(new URL('../js/perms.js', import.meta.url), 'utf8'), sandbox);
export const PERMS = sandbox.globalThis.QPERMS;
export const PRIVATE_LOGS = sandbox.globalThis.QPRIVATE_LOGS;

const REF_COLS = ['incidents', 'capa', 'rca', 'complaints', 'records', 'risks', 'fmeas', 'rounds', 'policies', 'standards', 'kpis', 'devices', 'committees', 'meetings', 'surveys', 'drills', 'extreports', 'mocks', 'projects', 'plans'];
export const can = (u, perm) => !!u && (PERMS[perm] || []).includes(u.role) && !(u.deny || []).includes(perm);

/* per-request lookups, built lazily from a loader (col → array of docs) */
export function context(u, load) {
  const memo = {}, map = col => memo[col] || (memo[col] = new Map(load(col).map(d => [String(d.id), d])));
  const ctx = {u, map};
  ctx.incident = x => !!x && (can(u, 'incident.all') || x.reporterId === u.id || (x.review && x.review.ownerId === u.id) || (u.role === 'supervisor' && x.deptId === u.deptId)
    || (u.role === 'biomed' && (!!x.deviceTag || (map('types').get(String(x.typeId)) || {}).cat === 'device')) || (() => { const r = x.rcaId && map('rca').get(String(x.rcaId)); return !!r && (r.team || []).includes(u.id); })());
  ctx.rca = r => !!r && (can(u, 'rca.edit') || r.leadId === u.id || (r.team || []).includes(u.id) || (can(u, 'rca.view') && ctx.incident(map('incidents').get(String(r.incidentId)))));
  ctx.capa = c => !!c && can(u, 'capa.view') && (can(u, 'incident.all') || c.ownerId === u.id || c.createdBy === u.id || c.deptId === u.deptId || (u.role === 'biomed' && c.deptId === 'biomed')
    || (!!c.incidentId && ctx.incident(map('incidents').get(String(c.incidentId)))));
  ctx.complaint = c => !!c && ((['qps', 'director', 'admin'].includes(u.role) && can(u, 'complaint.view')) || c.ownerId === u.id || c.loggedBy === u.id || (u.role === 'supervisor' && c.deptId === u.deptId));
  ctx.round = r => !!r && can(u, 'round.view') && (u.role !== 'supervisor' || r.deptId === u.deptId || r.leadId === u.id || (r.team || []).includes(u.id));
  ctx.risk = r => !!r && can(u, 'risk.view') && (u.role !== 'supervisor' || r.deptId === u.deptId || r.ownerId === u.id);
  ctx.kpi = k => !!k && can(u, 'kpi.view') && (u.role !== 'supervisor' || k.deptId === u.deptId);
  ctx.record = r => !!r && can(u, 'log.view') && (!PRIVATE_LOGS[r.type] || PRIVATE_LOGS[r.type].includes(u.role) || r.staff === u.id);
  /* a comment or audit entry is visible when the record it refers to is; unknown references stay with the quality team */
  ctx.byRef = ref => { ref = String(ref || ''); const col = REF_COLS.find(c => map(c).has(ref));
    return col ? visible(ctx, col, map(col).get(ref)) : ['qps', 'director', 'admin'].includes(u.role); };
  return ctx;
}

/* READ: may this user receive this record? */
export function visible(ctx, col, d) {
  const u = ctx.u;
  switch (col) {
    case 'users': case 'depts': case 'types': case 'checklists': case 'devices': case 'policies': return true;
    case 'incidents': return ctx.incident(d);
    case 'rca': return ctx.rca(d);
    case 'capa': return ctx.capa(d);
    case 'comments': return ctx.byRef(d.ref);
    case 'audit': return ['qps', 'director', 'admin'].includes(u.role) || d.by === u.id || ctx.byRef(d.ref);
    case 'kpis': return ctx.kpi(d);
    case 'kpiValues': return ctx.kpi(ctx.map('kpis').get(String(d.kpiId)));
    case 'standards': case 'mocks': return can(u, 'cbahi.view');
    case 'maint': return can(u, 'device.view');
    case 'complaints': return ctx.complaint(d);
    case 'rounds': return ctx.round(d);
    case 'risks': return ctx.risk(d);
    case 'fmeas': return can(u, 'risk.view');
    case 'surveys': case 'responses': return can(u, 'survey.view');
    case 'committees': case 'meetings': return can(u, 'committee.view');
    case 'extreports': return can(u, 'ext.view');
    case 'drills': return can(u, 'drill.view');
    case 'records': return ctx.record(d);
    case 'projects': return can(u, 'project.view');
    case 'plans': return can(u, 'plan.view');
    default: return false;
  }
}

/* only these keys changed between old and new (deep compare via JSON) */
const changedKeys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));

/* WRITE: may this user create (old = null), change, or delete (doc = null) this record? Returns null when allowed, else a reason. */
export function writeError(ctx, col, old, doc) {
  const u = ctx.u, next = doc || old, isNew = !old, del = !doc;
  if (old && !visible(ctx, col, old)) return 'record not visible to you';
  const need = perm => can(u, perm) ? null : `needs ${perm}`;
  switch (col) {
    case 'users': case 'depts': case 'types': return need('admin');
    case 'incidents': if (isNew) return next.reporterId === u.id || can(u, 'incident.all') ? null : 'reports are filed in your own name'; return del ? need('incident.review') : null;
    case 'rca': return can(u, 'rca.edit') || (next.team || []).includes(u.id) || next.leadId === u.id ? null : 'needs rca.edit or team membership';
    case 'capa': if (isNew) return null; /* corrective actions are raised by many workflows (logs, rounds, surveys) */
      return can(u, 'capa.create') || can(u, 'capa.verify') || old.ownerId === u.id ? null : 'only the owner or quality team can update this action';
    case 'comments': return isNew && next.by === u.id ? null : 'comments are added in your own name and never edited';
    case 'audit': return isNew && next.by === u.id ? null : 'the audit trail is append-only and written in your own name';
    case 'kpis': return need('kpi.define');
    case 'kpiValues': { const k = ctx.map('kpis').get(String(next.kpiId)); return can(u, 'kpi.enter') && k && (u.role !== 'supervisor' || k.deptId === u.deptId) ? null : 'needs kpi.enter for this indicator'; }
    case 'standards': return need('cbahi.upload');
    case 'mocks': return need('cbahi.edit');
    case 'devices': case 'maint': return can(u, 'device.edit') || u.role === 'qps' ? null : 'needs device.edit';
    case 'policies': { if (can(u, 'policy.edit')) return null; if (isNew || del) return 'needs policy.edit';
      const keys = changedKeys(old, doc), signer = [...(old.reviewers || []), ...(old.approvers || [])].includes(u.id) || can(u, 'policy.approve');
      const ackOnly = keys.every(k => k === 'acks') && changedKeys(old.acks, doc.acks).every(k => k === u.id);
      const signOnly = signer && keys.every(k => ['signatures', 'history', 'status', 'live', 'reviewDue', 'ackDue', 'returnNote', 'acks'].includes(k));
      return ackOnly || signOnly ? null : 'you may only record your own read-and-sign or your signature'; }
    case 'complaints': if (isNew) return need('complaint.log'); return can(u, 'complaint.manage') || old.ownerId === u.id ? null : 'only the quality team or the investigator can update this complaint';
    case 'checklists': return need('round.plan');
    case 'rounds': if (can(u, 'round.plan')) return null; if (!can(u, 'round.conduct')) return 'needs round.conduct';
      return isNew ? (next.recheckOf ? null : 'needs round.plan') : (old.leadId === u.id || (old.team || []).includes(u.id) ? null : 'only the round lead or team can conduct it');
    case 'risks': return can(u, 'risk.edit') && (u.role !== 'supervisor' || next.deptId === u.deptId || next.ownerId === u.id) ? null : 'needs risk.edit for this department';
    case 'fmeas': return need('risk.edit');
    case 'surveys': return need('survey.manage');
    case 'responses': return isNew ? need('survey.manage') : need('survey.view');
    case 'committees': return need('committee.manage');
    case 'meetings': { if (can(u, 'committee.manage')) return null; const c = ctx.map('committees').get(String(next.refId)); return c && (c.chairId === u.id || c.secretaryId === u.id) ? null : 'only the chair, secretary or quality team'; }
    case 'extreports': return isNew ? null : need('ext.edit');
    case 'drills': return need('drill.edit');
    case 'records': return can(u, 'log.view') && (!PRIVATE_LOGS[next.type] || PRIVATE_LOGS[next.type].includes(u.role)) ? null : 'this log is restricted';
    case 'projects': return need('project.edit');
    case 'plans': return need('plan.manage');
    default: return 'unknown collection';
  }
}
