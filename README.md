# Salamah · Q-MedOps

Quality and patient-safety operations platform (Arabic / English, RTL-first): OVR incident reporting, QPS review with SAL matrix, root cause analysis, CAPA, clinical indicators, CBAHI readiness and medical devices.

Runs fully in the browser: open `index.html`. Data is stored locally in IndexedDB; demo accounts use the password `demo`.

## Structure
- `index.html`, `styles.css`, `platform.css`: shell and styles
- `js/core.js`: storage, roles and permissions, workflow rules and task routing
- `js/app.js`: login, navigation, operations center, my tasks
- `js/incidents.js`: OVR list, detail, 3-step report form, printable AD-111 form (Parts I-V)
- `js/rca-capa.js`: investigations (RCA) and corrective actions (CAPA)
- `js/performance.js`: indicators, CBAHI readiness, medical devices
- `js/admin-reports.js`: monthly committee report, users, settings, backup
- `js/seed.js`, `js/seed-en.js`: demo data

## End-to-end test
```
node tests/e2e/run.mjs
```
Needs Node 22+ and Google Chrome (set `CHROME` to the executable path if it is not in the default Windows location). The test drives the real UI as every role: link crawl per role, low-risk / RCA / sentinel OVR workflows, device, indicator and CBAHI flows, access control and data integrity.
