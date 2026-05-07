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

## License

MIT
