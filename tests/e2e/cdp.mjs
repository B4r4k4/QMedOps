// Minimal Chrome DevTools Protocol driver (Node 22+, global WebSocket)
import {spawn} from 'node:child_process';
import {rmSync} from 'node:fs';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function launch({port = 9333, profile, url}) {
  try { rmSync(profile, {recursive: true, force: true}); } catch {}
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--allow-file-access-from-files', '--window-size=1440,1000', '--no-first-run', '--no-default-browser-check', 'about:blank'], {stdio: 'ignore'});
  let list;
  for (let i = 0; i < 60; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.find(t => t.type === 'page')) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  const target = list.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const {res, rej} = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) listeners.forEach(l => l(m)); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, {res, rej}); ws.send(JSON.stringify({id: i, method, params})); });
  const errors = [];
  listeners.push(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable');
  const navigate = async u => { await send('Page.navigate', {url: u}); await new Promise(r => setTimeout(r, 1500)); };
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const setFiles = async (selector, files) => {
    const {root} = await send('DOM.getDocument', {depth: -1});
    const {nodeId} = await send('DOM.querySelector', {nodeId: root.nodeId, selector});
    if (!nodeId) throw new Error('file input not found ' + selector);
    await send('DOM.setFileInputFiles', {nodeId, files});
  };
  const close = () => { try { ws.close(); } catch {} proc.kill(); };
  if (url) await navigate(url);
  return {send, evaluate, navigate, setFiles, errors, close};
}
