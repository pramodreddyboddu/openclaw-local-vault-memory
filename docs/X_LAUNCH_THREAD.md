# X Launch Thread (Draft)

## Post 1
We just shipped **Local Vault Memory v1** for OpenClaw.

A local-first memory system that is:
- traceable
- tiered
- auditable

No cloud memory backend. No API keys. Markdown on your own filesystem.

## Post 2
What v1 adds:
1) Deterministic tiered recall (`user > fact > episodic > legacy`)
2) Per-run context manifests (what loaded/skipped + why)
3) Promotion audit ledger (who/when/why/source/target)

## Post 3
Ops hardening included:
- retention/cleanup (`/memory-clean` dry-run/apply)
- backfill tool for legacy notes (dry-run/apply)
- conservative safety defaults

## Post 4
Why this matters:
Most assistants remember randomly.
This one remembers with **rules + receipts**.

Less context drift.
Better continuity.
Auditable memory decisions.

## Post 5
Quick start:
- install plugin
- set `vaultRoot`
- use `/remember`, `/recall`, `/promote`

Docs:
- `docs/MEMORY_SYSTEM_V1.md`
- `docs/RELEASE_NOTES_v1.md`

If you want, I can share a 5-minute setup walkthrough.
