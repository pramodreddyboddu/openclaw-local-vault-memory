import type { PluginConfig } from "../config.js";
import { appendRemember, resolveVaultPaths, type VaultPaths } from "../lib/fsVault.js";
import { appendInbox, listInbox, pruneInbox } from "../lib/inbox.js";
import { promoteInboxEntry, shouldAutoPromoteSafe } from "../lib/promote.js";
import { redactSecrets } from "../lib/redact.js";

function getLastTurn(messages: unknown[]): unknown[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && typeof msg === "object" && (msg as any).role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  return lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages;
}

function extractTextBlocks(turn: unknown[]): { role: string; text: string }[] {
  const out: { role: string; text: string }[] = [];

  for (const msg of turn) {
    if (!msg || typeof msg !== "object") continue;
    const role = (msg as any).role;
    if (role !== "user" && role !== "assistant") continue;

    const content = (msg as any).content;
    const parts: string[] = [];

    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        if ((block as any).type === "text" && typeof (block as any).text === "string") {
          parts.push((block as any).text);
        }
      }
    }

    if (parts.length) out.push({ role, text: parts.join("\n") });
  }

  return out;
}

function isHighSignal(line: string): boolean {
  const t = line.trim();
  if (t.length < 12) return false;
  // obvious noise
  if (/^(ok|okay|k|sure|thanks|cool|lol|haha)\b/i.test(t)) return false;
  return true;
}

type Captured = {
  decisions: string[];
  commitments: string[];
  preferences: string[];
  lessons: string[];
};

function classify(text: string): Captured {
  const cleaned = redactSecrets(text)
    .replace(/<local-vault-context>[\s\S]*?<\/local-vault-context>\s*/g, "")
    .trim();

  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const cap: Captured = {
    decisions: [],
    commitments: [],
    preferences: [],
    lessons: [],
  };

  for (const line of lines) {
    if (!isHighSignal(line)) continue;

    if (/(we decided|decision:|we will use|going with|let's use|choose|chosen)/i.test(line)) {
      cap.decisions.push(line);
      continue;
    }

    if (/(i will|we will|i'll|we'll|promise|follow up|remind me|due|by tomorrow|by monday)/i.test(line)) {
      cap.commitments.push(line);
      continue;
    }

    if (/(i prefer|i like|i love|i hate|my preference|i don't want|i do not want)/i.test(line)) {
      cap.preferences.push(line);
      continue;
    }

    if (/(lesson|note to self|never again|avoid|rule:)/i.test(line)) {
      cap.lessons.push(line);
      continue;
    }
  }

  return cap;
}

function unique(xs: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

function conservativeCapture(paths: VaultPaths, turnText: string) {
  const cap = classify(turnText);

  const decisions = unique(cap.decisions, 3);
  const commitments = unique(cap.commitments, 3);
  const prefs = unique(cap.preferences, 3);
  const lessons = unique(cap.lessons, 3);

  for (const d of decisions) appendInbox(paths, "decision", d);
  for (const c of commitments) appendInbox(paths, "commitment", c);
  for (const p of prefs) appendInbox(paths, "preference", p);
  for (const l of lessons) appendInbox(paths, "lesson", l);
}

function maybeAutoPromoteSafe(paths: VaultPaths) {
  const recent = listInbox(paths, 15);
  for (const e of recent) {
    if (!shouldAutoPromoteSafe(e)) continue;
    promoteInboxEntry(paths, e);
  }
}

export function buildCaptureHandler(cfg: PluginConfig) {
  const paths = resolveVaultPaths(cfg.vaultRoot);

  return async (event: Record<string, unknown>) => {
    if (!cfg.autoCapture) return;
    if (!event.success) return;
    const messages = Array.isArray((event as any).messages) ? ((event as any).messages as unknown[]) : [];
    if (messages.length === 0) return;

    const turn = getLastTurn(messages);
    const blocks = extractTextBlocks(turn);
    if (!blocks.length) return;

    const joined = blocks
      .map((b) => `[role:${b.role}]\n${b.text}\n[/${b.role}]`)
      .join("\n\n");

    if (cfg.captureMode === "everything") {
      // dump verbatim to daily log as a remember entry
      appendRemember(paths, joined);
      return;
    }

    conservativeCapture(paths, joined);

    // Retention: prune inbox periodically (best-effort; never fails the turn)
    try {
      pruneInbox(paths, cfg.inboxRetentionDays);
    } catch {
      // ignore
    }

    if (cfg.autoPromote === "safe") {
      maybeAutoPromoteSafe(paths);
    }
  };
}
