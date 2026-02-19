# Improvements (2026-02-19)

These are practical upgrades adopted from real operator usage.

## 1) Actionable-first promotion gate
- Promote only memory lines that are actionable/high-signal.
- Avoid promoting generic/noise lines.
- Keep long-term memory concise and useful.

## 2) Decision discipline
- Major decisions should be documented with stable IDs.
- Record why/where-used to reduce repeated debates.

## 3) Daily project anchor snapshot
- Add a 5-line daily snapshot per active project:
  - Status / Blocker / Next Action / Owner / Due
- Improves continuity after compaction/model/session changes.

## Why this matters
- Lower memory noise
- Better continuity
- Faster execution with less re-explaining
