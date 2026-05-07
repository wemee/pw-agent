#!/usr/bin/env node
/**
 * pw-agent — headed Playwright browser with HTTP API.
 * 給 AI agent 在多輪對話中持續操作同一個瀏覽器。
 *
 * Usage:
 *   pw-agent [--url=<url>] [--port=<port>] [--state=<path>] [--headless]
 */

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const HELP = `pw-agent — headed Playwright browser with HTTP API

Usage:
  pw-agent [options]

Options:
  --url=<url>       initial page URL (default: about:blank)
  --port=<n>        HTTP API port (default: 3099)
  --state=<path>    session state JSON path (default: ./pw-state.json)
  --headless        run headless (default: false)
  -h, --help        show this help

API:
  GET  /url                current page URL
  GET  /html               full DOM HTML
  GET  /screenshot         base64 PNG (viewport)
  GET  /eval?js=<code>     run JS in page, returns JSON { result }
  POST /eval     { js }    long-code variant
  POST /goto     { url }   navigate
  POST /save-state         dump storageState now (also auto on Ctrl+C)

On SIGINT/SIGTERM: storageState is auto-saved to --state path before exit.
`;

function parseArgs(argv) {
  const args = {
    port: 3099,
    url: 'about:blank',
    state: './pw-state.json',
    headless: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--headless') args.headless = true;
    else if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a.startsWith('--port=')) args.port = Number(a.slice(7));
    else if (a.startsWith('--url=')) args.url = a.slice(6);
    else if (a.startsWith('--state=')) args.state = a.slice(8);
    else { console.error(`Unknown argument: ${a}`); console.error(HELP); process.exit(1); }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) {
    console.error(`Invalid --port: ${args.port}`);
    process.exit(1);
  }
  return args;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const args = parseArgs(process.argv);
const statePath = path.resolve(args.state);

const browser = await chromium.launch({
  headless: args.headless,
  slowMo: args.headless ? 0 : 50,
});

const contextOptions = {};
if (fs.existsSync(statePath)) {
  contextOptions.storageState = statePath;
  console.log(`已載入 session state: ${statePath}`);
} else {
  console.log(`尚無 session state（將在退出時建立 ${statePath}）`);
}

const context = await browser.newContext(contextOptions);
const page = await context.newPage();
await page.goto(args.url);

console.log(`瀏覽器已開啟 → ${args.url}`);
console.log(`API: http://localhost:${args.port}`);
console.log('Ctrl+C 結束會自動存 session state。');

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const u = new URL(req.url, `http://localhost:${args.port}`);

  try {
    if (req.method === 'GET' && u.pathname === '/url') {
      res.end(JSON.stringify({ url: page.url() }));

    } else if (req.method === 'GET' && u.pathname === '/html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await page.content());

    } else if (req.method === 'GET' && u.pathname === '/screenshot') {
      const buf = await page.screenshot({ fullPage: false });
      res.setHeader('Content-Type', 'text/plain');
      res.end(buf.toString('base64'));

    } else if (req.method === 'GET' && u.pathname === '/eval') {
      const js = u.searchParams.get('js');
      if (!js) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing js param' })); return; }
      const result = await page.evaluate(js);
      res.end(JSON.stringify({ result }));

    } else if (req.method === 'POST' && u.pathname === '/eval') {
      const body = await readBody(req);
      if (!body.js) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing js in body' })); return; }
      const result = await page.evaluate(body.js);
      res.end(JSON.stringify({ result }));

    } else if (req.method === 'POST' && u.pathname === '/goto') {
      const body = await readBody(req);
      if (!body.url) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing url in body' })); return; }
      await page.goto(body.url);
      res.end(JSON.stringify({ url: page.url() }));

    } else if (req.method === 'POST' && u.pathname === '/save-state') {
      await context.storageState({ path: statePath });
      res.end(JSON.stringify({ saved: statePath }));

    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    }
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(args.port);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n存 session state...');
  try {
    await context.storageState({ path: statePath });
    console.log(`已存 → ${statePath}`);
  } catch (e) {
    console.error('存 state 失敗:', e);
  }
  try { await browser.close(); } catch {}
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
