# pw-agent

Headed Playwright browser with HTTP API. Give AI agents a persistent browser they can drive across multi-turn conversations — manually log in once, the session is reused next run.

## Quick start

```bash
npx github:wemee/pw-agent --url=https://example.com
```

First run opens a real Chromium window. Log in manually. `Ctrl+C` saves the session to `./pw-state.json`. Next run loads it automatically and skips the login.

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--url=<url>` | `about:blank` | Initial page |
| `--port=<n>` | `3099` | HTTP API port |
| `--state=<path>` | `./pw-state.json` | Playwright `storageState` JSON file |
| `--headless` | off | Run headless |
| `-h`, `--help` | — | Show help |

## HTTP API (port 3099 by default)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET`  | `/url` | — | `{ url }` |
| `GET`  | `/html` | — | full DOM HTML |
| `GET`  | `/screenshot` | — | base64 PNG (viewport) |
| `GET`  | `/eval?js=<code>` | — | `{ result }` |
| `POST` | `/eval` | `{ js }` | `{ result }` |
| `POST` | `/goto` | `{ url }` | `{ url }` |
| `POST` | `/save-state` | — | `{ saved: <path> }` |

`SIGINT` / `SIGTERM` auto-saves `storageState` before exit.

## Examples

```bash
# Run JS in page
curl 'http://localhost:3099/eval?js=document.title'

# Long code via POST
curl -X POST http://localhost:3099/eval \
  -H 'content-type: application/json' \
  -d '{"js":"Array.from(document.querySelectorAll(\"input\")).map(i=>i.id)"}'

# Navigate
curl -X POST http://localhost:3099/goto \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/dashboard"}'

# Force-save state mid-session
curl -X POST http://localhost:3099/save-state
```

## Install

`npx github:wemee/pw-agent` is the canonical entry — no global install needed. The first run downloads Chromium via Playwright's `postinstall`.

If `npx` cache misbehaves, force a fresh clone:

```bash
npx --yes github:wemee/pw-agent#main --url=...
```

## For AI agents

If a human pointed you at this repo, or said "use pw-agent", here is the playbook. Read it once, then act.

### Assume the human has already started the server

The human runs `npx github:wemee/pw-agent --url=... --state=...`, logs in by hand, and tells you the port (default `3099`). **Do not** start your own Playwright / Puppeteer / Chromium — drive the existing browser via the HTTP API. Do not try to close, relaunch, or kill the process; the user owns its lifecycle.

### Core moves

```bash
# Where am I?
curl -s http://localhost:3099/url

# What does it look like?
curl -s http://localhost:3099/screenshot      # base64 PNG, viewport only

# Inspect the DOM compactly (preferred over /html for big pages)
curl -s 'http://localhost:3099/eval?js=Array.from(document.querySelectorAll("input")).map(i=>({id:i.id,type:i.type,name:i.name}))'

# Long JS via POST
curl -sX POST http://localhost:3099/eval \
  -H 'content-type: application/json' \
  -d '{"js":"<your JS as a JSON-escaped string>"}'

# Navigate
curl -sX POST http://localhost:3099/goto \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/x"}'

# Force-save session right now (e.g. before a risky action)
curl -sX POST http://localhost:3099/save-state
```

### Patterns

- **Reading large pages**: prefer targeted `eval` (`document.querySelector(...).textContent`, `outerHTML` of one node) over dumping all of `/html`. Token budget matters.
- **Filling forms**: setting `el.value = ...` alone is silently ignored by React / Vue / ASP.NET WebForms. After setting the value, dispatch the events the framework listens for — usually `input` and `change`, sometimes `blur`. For ASP.NET cascading dropdowns, triggering the page's own change handler is more reliable than clicking option elements.
- **Waits between steps**: short `await new Promise(r=>setTimeout(r,500))` inside an `eval` is fine; long waits should poll with `eval` rather than racing the page.
- **Verification**: after every state-changing action, follow up with a read (`/url`, targeted `eval`) to confirm what actually happened. Don't assume the action worked.

### Don'ts

- Don't navigate (`POST /goto`) away from a logged-in page without first `POST /save-state`. Some hosts invalidate the session on navigation; cheap insurance.
- Don't write `pw-state.json` into git or paste it into chats — it contains live session cookies.
- Don't assume the current URL is the one you last navigated to; redirects happen. `GET /url` first when in doubt.
- Don't ask the human to manually copy values out of the page — use `eval` to read them programmatically.

### Recovery

- HTTP 500 `{ "error": "..." }` is usually a selector typo or stale element reference. Re-read the relevant fragment via `eval` and rebuild the selector.
- If the page hangs, an explicit `POST /goto` to a known-good URL breaks out. The browser has a single tab, so there is no tab confusion to debug.

## License

MIT
