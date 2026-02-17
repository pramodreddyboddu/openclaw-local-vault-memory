# Release Notes — Local Vault Memory v1

## Summary
Local Vault Memory v1 introduces a production-ready local memory workflow for OpenClaw with deterministic recall, per-run traceability, promotion audit logs, and safe maintenance tooling.

## Highlights

### 1) Tiered deterministic recall
- Priority order:
  1. `context/memory/user/*.md`
  2. `context/memory/fact/*.md`
  3. `context/memory/episodic/*.md`
  4. legacy fallback sources
- Deterministic dedupe and token-budget controls.
- Improved multi-line recall chunking/ranking.

### 2) Per-run context manifests
- Emits JSONL manifests at `context/manifests/YYYY-MM-DD.jsonl`.
- Records loaded/skipped files + reason tags (`relevance`, `recency`, `token_budget`).

### 3) Promotion audit trail
- Append-only ledger: `context/memory/promotion_ledger.jsonl`.
- Records source→target trace with `who/when/why` metadata.

### 4) Safe retention + maintenance
- Retention support for manifests and ledger.
- `/memory-clean` dry-run/apply.
- CLI cleanup helper and workspace wrapper script.

### 5) Backfill tooling
- `memory:backfill` supports dry-run and apply.
- Idempotent markers to avoid duplicate migrations.
- No deletions.

## Validation
- Test suite passing (17/17).

## Key docs
- System guide: `docs/MEMORY_SYSTEM_V1.md`
- README: `README.md`

## Compatibility
- Backward compatible with existing legacy memory sources.
- No required cloud services or API keys.

## Known limitations
- Recall ranking is deterministic lexical scoring (not embedding-based semantic retrieval).
- Backfill is intentionally conservative; review dry-run output before apply.
