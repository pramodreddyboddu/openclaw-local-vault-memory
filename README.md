# Local Vault Memory (OpenClaw plugin)

Local-first, filesystem-backed memory for OpenClaw.

- No cloud.
- No API keys.
- Auditable markdown files.

## What it does (MVP)

### Who this helps
- **New users (no setup):** get durable `/remember` + `/recall` immediately (daily log is created automatically).
- **Intermediate users (existing notes):** point `vaultRoot` at their notes folder; `/recall` works without migration.
- **Power users (structured vault):** get trigger-based recall injection from `VAULT_INDEX.md` + `WORKING_SET.md`.

### Auto-recall (quiet, deterministic)
Only injects context when it’s likely useful (e.g. you say “remember/last time/why/decision/link…” or project keywords).

It injects a small context block built from:
- `project_anchors/WORKING_SET.md` (summary)
- `project_anchors/VAULT_INDEX.md` (top snippet)
- optional recall matches (file:line) when explicit recall triggers are used

### Manual capture
- `/remember <text>` appends to today’s `memory/YYYY-MM-DD.md`

### Auto-capture (opt-in)
When enabled (`autoCapture: true`), the plugin will capture high-signal memories locally after each successful turn.
Default behavior is **conservative**: decisions/commitments/preferences/lessons only.

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
