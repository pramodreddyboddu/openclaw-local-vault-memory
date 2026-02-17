# Local Vault Memory v1 (Publish Doc)

A local-first memory system for OpenClaw that is **traceable, tiered, and auditable**.

## What you get

1. **Durable memory capture**
   - `/remember <text>` appends to `memory/YYYY-MM-DD.md`.
   - Optional auto-capture stages high-signal items in `project_anchors/MEMORY_INBOX.md`.

2. **Smart recall with deterministic rules**
   - `/recall <query>` searches tiered memory in this priority:
     1) `context/memory/user/*.md`
     2) `context/memory/fact/*.md`
     3) `context/memory/episodic/*.md`
     4) legacy fallback (`WORKING_SET.md`, `VAULT_INDEX.md`, `MEMORY.md`, recent daily logs, `project_anchors/*.md`)
   - Dedupe: case/whitespace-normalized first-hit-wins.
   - Budget controls: `recallMaxHits`, `recallSearchMaxChars`.

3. **Per-turn traceability (context manifests)**
   - Every run logs context decisions to:
     - `context/manifests/YYYY-MM-DD.jsonl`
   - Includes loaded/skipped files and reasons (`relevance`, `recency`, `token_budget`).

4. **Promotion audit trail**
   - `/promote <id>` writes append-only ledger rows to:
     - `context/memory/promotion_ledger.jsonl`
   - Records `who/when/why` + source snippet + target destination.

5. **Operational hygiene**
   - Retention/cleanup for manifests + promotion ledger.
   - Dry-run/apply tools for cleanup and legacy backfill.

---

## Install (5 minutes)

### Prereqs
- OpenClaw installed
- Node 18+

### Steps
```bash
cd /path/to/vault/openclaw-local-vault-memory
npm i
npm run build
```

Install with your OpenClaw plugin flow, then configure:

```json
{
  "vaultRoot": "/path/to/vault",
  "autoCapture": true,
  "captureMode": "conservative",
  "autoPromote": "safe",
  "inboxRetentionDays": 30,
  "maxInjectChars": 2500,
  "recallMaxHits": 7,
  "recallSearchMaxChars": 1800,
  "contextRetentionDays": 30,
  "manifestMaxFiles": 60,
  "promotionLedgerMaxBytes": 524288
}
```

---

## Day-1 commands

- `/remember <text>`
- `/recall <query>`
- `/inbox [n]`
- `/promote <id>`
- `/commitments`
- `/done <C-...>`
- `/memory-clean` (dry-run)
- `/memory-clean apply`

CLI helpers:
```bash
npm run memory:cleanup -- --vault-root /path/to/vault
npm run memory:cleanup -- --vault-root /path/to/vault --apply
npm run memory:backfill -- --vault-root /path/to/vault
npm run memory:backfill -- --vault-root /path/to/vault --apply
```

---

## Before vs after (quick)

- **Before:** memory existed but limited traceability and inconsistent recall order.
- **After v1:** deterministic tiered recall, per-run manifest logs, and promotion-level audit trail.

---

## Safety model

- Local filesystem only (no cloud memory backend).
- Append-only audit ledger for promotions.
- Conservative auto-promote (`safe`) limits automatic writes.
- Cleanup preserves current-day manifest and current-day ledger rows.

---

## Known limits (v1)

- Recall ranking is lexical/deterministic (not semantic embeddings).
- Backfill heuristics are conservative; always review dry-run first.
- Malformed ledger rows are skipped during cleanup.

---

## Validation

```bash
npm test
```

Expected: all tests pass.

---

## Recommended public release artifacts

1. This doc (`docs/MEMORY_SYSTEM_V1.md`)
2. README link to this doc
3. One demo GIF (remember → recall → promote → ledger)
4. Short changelog entry with key outcomes
