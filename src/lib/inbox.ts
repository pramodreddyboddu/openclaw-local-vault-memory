import fs from "node:fs";
import { redactSecrets } from "./redact.js";
import type { VaultPaths } from "./fsVault.js";

export type InboxType = "decision" | "commitment" | "lesson" | "preference" | "other";
export type InboxEntry = {
  id: string;
  type: InboxType;
  status: "pending" | "promoted";
  createdAt: string;
  text: string;
};

function ensureInbox(paths: VaultPaths) {
  fs.mkdirSync(paths.anchorsDir, { recursive: true });
  if (!fs.existsSync(paths.inboxMd)) {
    fs.writeFileSync(
      paths.inboxMd,
      "# MEMORY_INBOX\n\nStaging area for auto-captured candidate memories.\n\n",
      "utf8",
    );
  }
}

function nextInboxId(md: string, ymd: string): string {
  const re = new RegExp(`\\bM-${ymd}-(\\d{3})\\b`, "g");
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  const next = String(max + 1).padStart(3, "0");
  return `M-${ymd}-${next}`;
}

export function appendInbox(paths: VaultPaths, type: InboxType, text: string): InboxEntry {
  ensureInbox(paths);

  let md = "";
  try {
    md = fs.readFileSync(paths.inboxMd, "utf8");
  } catch {
    md = "# MEMORY_INBOX\n\n";
  }

  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const id = nextInboxId(md, ymd);

  const entry: InboxEntry = {
    id,
    type,
    status: "pending",
    createdAt: now.toISOString(),
    text: redactSecrets(text).trim(),
  };

  const block =
    `\n## ${entry.id} (${entry.type})\n` +
    `- Status: ${entry.status}\n` +
    `- Created: ${entry.createdAt}\n` +
    `- Text: ${entry.text}\n`;

  fs.appendFileSync(paths.inboxMd, block, "utf8");
  return entry;
}

export function listInbox(paths: VaultPaths, limit = 10): InboxEntry[] {
  ensureInbox(paths);
  const md = fs.readFileSync(paths.inboxMd, "utf8");
  const lines = md.split(/\r?\n/);

  const entries: InboxEntry[] = [];
  let cur: Partial<InboxEntry> | null = null;

  const flush = () => {
    if (!cur?.id || !cur.type || !cur.createdAt || !cur.text || !cur.status) return;
    entries.push(cur as InboxEntry);
  };

  for (const raw of lines) {
    const h = raw.match(/^##\s+(M-\d{8}-\d{3})\s+\(([^)]+)\)\s*$/);
    if (h) {
      if (cur) flush();
      cur = { id: h[1], type: (h[2] as any) };
      continue;
    }
    if (!cur) continue;

    const s = raw.match(/^-\s+Status:\s+(pending|promoted)\s*$/i);
    if (s) {
      cur.status = s[1].toLowerCase() as any;
      continue;
    }
    const c = raw.match(/^-\s+Created:\s+(.+)$/);
    if (c) {
      cur.createdAt = c[1].trim();
      continue;
    }
    const t = raw.match(/^-\s+Text:\s+(.+)$/);
    if (t) {
      cur.text = t[1];
      continue;
    }
  }
  if (cur) flush();

  return entries.slice(-limit);
}

export function getInboxById(paths: VaultPaths, id: string): InboxEntry | null {
  const all = listInbox(paths, 1000);
  return all.find((e) => e.id === id) ?? null;
}

export function markInboxPromoted(paths: VaultPaths, id: string): boolean {
  ensureInbox(paths);
  const md = fs.readFileSync(paths.inboxMd, "utf8");
  const re = new RegExp(
    `(##\\s+${id.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&")}\\s+\\([^)]+\\)\\s*\\n-\\s+Status:\\s+)pending`,
    "m",
  );
  const next = md.replace(re, `$1promoted`);
  if (next === md) return false;
  fs.writeFileSync(paths.inboxMd, next, "utf8");
  return true;
}

export type PruneResult = { ok: true; pruned: number } | { ok: false; message: string };

export function pruneInbox(paths: VaultPaths, retentionDays: number): PruneResult {
  ensureInbox(paths);

  const days = Number.isFinite(retentionDays) ? Math.max(1, Math.min(365, retentionDays)) : 30;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const md = fs.readFileSync(paths.inboxMd, "utf8");
  const lines = md.split(/\r?\n/);

  const keepBlocks: string[] = [];
  let curLines: string[] = [];
  let curCreated: string | null = null;

  const flush = () => {
    if (!curLines.length) return;
    let keep = true;
    if (curCreated) {
      const t = Date.parse(curCreated);
      if (Number.isFinite(t) && t < cutoffMs) keep = false;
    }
    if (keep) keepBlocks.push(curLines.join("\n"));
    curLines = [];
    curCreated = null;
  };

  // Preserve header up to first entry
  const header: string[] = [];
  let inEntries = false;

  for (const raw of lines) {
    const isH = /^##\s+M-\d{8}-\d{3}\s+\([^)]+\)\s*$/.test(raw);
    if (isH) {
      if (!inEntries) inEntries = true;
      flush();
      curLines.push(raw);
      continue;
    }

    if (!inEntries) {
      header.push(raw);
      continue;
    }

    const c = raw.match(/^-\s+Created:\s+(.+)$/);
    if (c) curCreated = c[1].trim();

    curLines.push(raw);
  }
  flush();

  const next = `${header.join("\n").trimEnd()}\n\n${keepBlocks.join("\n\n").trim()}`.trimEnd() + "\n";
  const beforeCount = listInbox(paths, 1000000).length;
  fs.writeFileSync(paths.inboxMd, next, "utf8");
  const afterCount = listInbox(paths, 1000000).length;

  return { ok: true, pruned: Math.max(0, beforeCount - afterCount) };
}
