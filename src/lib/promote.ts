import type { VaultPaths } from "./fsVault.js";
import type { InboxEntry } from "./inbox.js";
import { markInboxPromoted } from "./inbox.js";
import {
  appendDecision,
  appendToCommitments,
  appendToLessons,
  appendToPreferences,
} from "./fsVault.js";
import { addCommitment } from "./commitments.js";

export type PromoteResult = { ok: true; message: string } | { ok: false; message: string };

export function promoteInboxEntry(paths: VaultPaths, entry: InboxEntry): PromoteResult {
  if (entry.status === "promoted") return { ok: false, message: `Already promoted: ${entry.id}` };

  if (entry.type === "decision") {
    const res = appendDecision(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    return { ok: true, message: `Promoted ${entry.id} → DECISIONS (${res.id})` };
  }

  if (entry.type === "commitment") {
    const c = addCommitment(paths, entry.text);
    appendToCommitments(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    return { ok: true, message: `Promoted ${entry.id} → COMMITMENTS (${c.id}) + MEMORY.md (Commitments)` };
  }

  if (entry.type === "lesson") {
    appendToLessons(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    return { ok: true, message: `Promoted ${entry.id} → MEMORY.md (Lessons)` };
  }

  if (entry.type === "preference") {
    appendToPreferences(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    return { ok: true, message: `Promoted ${entry.id} → MEMORY.md (Preferences)` };
  }

  appendToCommitments(paths, `[inbox:${entry.type}] ${entry.text}`);
  markInboxPromoted(paths, entry.id);
  return { ok: true, message: `Promoted ${entry.id} → MEMORY.md (Commitments)` };
}

export function shouldAutoPromoteSafe(entry: InboxEntry): boolean {
  if (entry.status !== "pending") return false;

  // Normalize: strip common markdown emphasis/prefix noise so "**Decision:**" counts.
  const raw = (entry.text || "").trim();
  const t = raw
    .toLowerCase()
    .replace(/^[^a-z0-9]+/g, "") // leading punctuation/markdown
    .replace(/^\*\*([^*]+)\*\*:\s*/g, "$1: ") // "**decision**:" -> "decision:"
    .replace(/^`([^`]+)`:\s*/g, "$1: ") // "`decision`:" -> "decision:"
    .trim();

  if (entry.type === "decision") {
    if (t.includes("?")) return false;
    // Reject templates/placeholders that would pollute DECISIONS.md
    if (
      raw.includes("<one sentence>") ||
      /\bdecision:\s*\.\.\.\b/i.test(raw) ||
      /\bdecision:\s*<.*?>/i.test(raw) ||
      /\bwhy:\s*\.\.\./i.test(raw) ||
      /\bwhy:\s*<.*?>/i.test(raw)
    ) {
      return false;
    }

    return (
      t.startsWith("decision:") ||
      t.includes("we decided") ||
      t.includes("going with") ||
      t.includes("chosen")
    );
  }

  if (entry.type === "commitment") {
    // must have a due/deadline signal
    return (
      t.includes("remind me") ||
      t.includes(" due ") ||
      /\bby\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t) ||
      /\b(by|due)\s+\d{4}-\d{2}-\d{2}\b/.test(t) ||
      /\btomorrow\b/.test(t)
    );
  }

  return false;
}
