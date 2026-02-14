# Local Vault Memory (OpenClaw plugin)

Local-first, filesystem-backed memory for OpenClaw.

- No cloud.
- No API keys.
- Auditable markdown files.

## What it does (MVP)

### Auto-recall (safe, deterministic)
Before each agent turn, it injects a small context block built from:
- `project_anchors/VAULT_INDEX.md`
- `project_anchors/WORKING_SET.md`

### Manual capture
- `/remember <text>` appends to today’s `memory/YYYY-MM-DD.md`

### Manual recall
- `/recall <query>` searches across:
  - `WORKING_SET.md`, `VAULT_INDEX.md`, `MEMORY.md`
  - last ~7 daily logs
  - all `project_anchors/*.md`

## Install (dev)

> This repo is intentionally minimal; we’ll harden + add tests before publishing.

1) Build:
```bash
npm i
npm run build
```

2) Install plugin into OpenClaw (dev path install depends on OpenClaw plugin tooling).

## Config

- `vaultRoot` (default `/Users/pramod/clawd`)
- `maxInjectChars` (default `2500`)
- `debug` (default `false`)

## Safety

Basic secret redaction runs on content read/written (best-effort).

## Roadmap (tight)
- Add tests for search + redaction
- Add “recall triggers” (only do deeper search when user says remember/last time/why/link/decision)
- Add `forget` (edit/remove memory entries) **only with explicit approval**
