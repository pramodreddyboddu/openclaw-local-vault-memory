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
When enabled (`autoCapture: true`), the plugin will capture high-signal candidate memories locally after each successful turn.

**Important:** auto-capture writes to a staging file first:
- `project_anchors/MEMORY_INBOX.md`

Default behavior is **conservative**: decisions/commitments/preferences/lessons only.

### Auto-promote (optional)
- `autoPromote: "off" | "safe"` (default: off)
- `safe` will auto-promote only very high-confidence **decisions + commitments** to avoid inbox backlog.
  - Preferences/lessons remain pending by default.

### Manual recall
- `/recall <query>` searches across:
  - `WORKING_SET.md`, `VAULT_INDEX.md`, `MEMORY.md`
  - last ~7 daily logs
  - all `project_anchors/*.md`

### Inbox + promotion
- `/inbox [n]` lists recent staged memories
- `/promote <id>` promotes one staged memory into long-term files

### Commitments (shadow follow-ups)
- `/commitments` lists open commitments
- `/done <C-...>` marks a commitment done

## Install

### Non‑tech install (goal)

Target experience (no terminal, no JSON):
1) Open OpenClaw → **Plugins**
2) Find **Local Vault Memory** → **Install**
3) Open **Settings** for the plugin
4) Toggle:
   - **Auto‑capture:** ON
   - **Auto‑promote:** Safe
   - **Inbox retention:** 30 days
5) Done.

Notes:
- This creates/uses local markdown files inside your vault (no cloud).
- Safe auto‑promote only promotes **Decisions + Commitments**.

### Developer install (today)

> This repo is intentionally minimal; we’ll harden + add tests before publishing.

1) Build:
```bash
npm i
npm run build
```

2) Install into OpenClaw (dev path install). The exact command depends on your OpenClaw plugin tooling/version.

3) Configure the plugin (recommended trial config):
```json
{
  "vaultRoot": "/Users/pramod/clawd",
  "autoCapture": true,
  "captureMode": "conservative",
  "autoPromote": "safe",
  "inboxRetentionDays": 30,
  "maxInjectChars": 2500
}
```

## Config

- `vaultRoot` (default `/Users/pramod/clawd`)
- `maxInjectChars` (default `2500`)
- `debug` (default `false`)

## Uninstall / Disable

Non‑tech uninstall (goal): Open OpenClaw → Plugins → Local Vault Memory → **Disable** or **Uninstall**.

Developer uninstall (today): remove/disable the plugin via your OpenClaw plugin tooling.

Data note:
- Uninstalling the plugin **does not delete** your vault files by default (your markdown files remain on disk).
- Captured data locations (default when vaultRoot is `/Users/pramod/clawd`):
  - `memory/YYYY-MM-DD.md` (daily log)
  - `MEMORY.md` (curated long-term)
  - `project_anchors/MEMORY_INBOX.md` (staging)
  - `project_anchors/DECISIONS.md`
  - `project_anchors/COMMITMENTS.md`

## Safety

Basic secret redaction runs on content read/written (best-effort).

## Roadmap (tight)
- Add tests for search + redaction
- Add “recall triggers” (only do deeper search when user says remember/last time/why/link/decision)
- Add `forget` (edit/remove memory entries) **only with explicit approval**
