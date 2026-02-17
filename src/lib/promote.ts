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
import { appendPromotionLedger } from "./promotionLedger.js";

export type PromoteResult = { ok: true; message: string } | { ok: false; message: string };

type PromoteMeta = {
  who?: string;
  why?: string;
};

export function promoteInboxEntry(paths: VaultPaths, entry: InboxEntry, meta?: PromoteMeta): PromoteResult {
  if (entry.status === "promoted") return { ok: false, message: `Already promoted: ${entry.id}` };

  const who = meta?.who || "manual:/promote";
  const why = meta?.why || "manual-promotion";
  const source = {
    inboxId: entry.id,
    type: entry.type,
    file: paths.inboxMd,
    snippet: entry.text.slice(0, 280),
  };

  if (entry.type === "decision") {
    const res = appendDecision(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    appendPromotionLedger(paths, {
      at: new Date().toISOString(),
      who,
      when: "promotion",
      why,
      source,
      target: { kind: "decision", file: res.file, ref: res.id },
    });
    return { ok: true, message: `Promoted ${entry.id} → DECISIONS (${res.id})` };
  }

  if (entry.type === "commitment") {
    const c = addCommitment(paths, entry.text);
    const m = appendToCommitments(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    appendPromotionLedger(paths, {
      at: new Date().toISOString(),
      who,
      when: "promotion",
      why,
      source,
      target: { kind: "commitment", file: c ? paths.commitmentsMd : m.file, ref: c.id },
    });
    return { ok: true, message: `Promoted ${entry.id} → COMMITMENTS (${c.id}) + MEMORY.md (Commitments)` };
  }

  if (entry.type === "lesson") {
    const res = appendToLessons(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    appendPromotionLedger(paths, {
      at: new Date().toISOString(),
      who,
      when: "promotion",
      why,
      source,
      target: { kind: "lesson", file: res.file, ref: "MEMORY.md##📚-Lessons" },
    });
    return { ok: true, message: `Promoted ${entry.id} → MEMORY.md (Lessons)` };
  }

  if (entry.type === "preference") {
    const res = appendToPreferences(paths, entry.text);
    markInboxPromoted(paths, entry.id);
    appendPromotionLedger(paths, {
      at: new Date().toISOString(),
      who,
      when: "promotion",
      why,
      source,
      target: { kind: "preference", file: res.file, ref: "MEMORY.md##🎛-Preferences" },
    });
    return { ok: true, message: `Promoted ${entry.id} → MEMORY.md (Preferences)` };
  }

  const res = appendToCommitments(paths, `[inbox:${entry.type}] ${entry.text}`);
  markInboxPromoted(paths, entry.id);
  appendPromotionLedger(paths, {
    at: new Date().toISOString(),
    who,
    when: "promotion",
    why,
    source,
    target: { kind: "other", file: res.file, ref: "MEMORY.md##✅-Commitments" },
  });
  return { ok: true, message: `Promoted ${entry.id} → MEMORY.md (Commitments)` };
}

export function shouldAutoPromoteSafe(entry: InboxEntry): boolean {
  if (entry.status !== "pending") return false;

  const raw = (entry.text || "").trim();
  const t = raw
    .toLowerCase()
    .replace(/^[^a-z0-9]+/g, "")
    .replace(/^\*\*([^*]+)\*\*:\s*/g, "$1: ")
    .replace(/^`([^`]+)`:\s*/g, "$1: ")
    .trim();

  if (entry.type === "decision") {
    if (t.includes("?")) return false;
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
