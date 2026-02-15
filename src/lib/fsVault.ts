import fs from "node:fs";
import path from "node:path";
import { redactSecrets } from "./redact.js";

export type VaultPaths = {
  root: string;
  workingSet: string;
  vaultIndex: string;
  memoryMd: string;
  dailyDir: string;
  rawDir: string;
  anchorsDir: string;
  inboxMd: string;
  commitmentsMd: string;
};

export function resolveVaultPaths(vaultRoot: string): VaultPaths {
  const root = vaultRoot;
  const anchorsDir = path.join(root, "project_anchors");
  return {
    root,
    workingSet: path.join(anchorsDir, "WORKING_SET.md"),
    vaultIndex: path.join(anchorsDir, "VAULT_INDEX.md"),
    memoryMd: path.join(root, "MEMORY.md"),
    dailyDir: path.join(root, "memory"),
    rawDir: path.join(root, "memory", "raw"),
    anchorsDir,
    inboxMd: path.join(anchorsDir, "MEMORY_INBOX.md"),
    commitmentsMd: path.join(anchorsDir, "COMMITMENTS.md"),
  };
}

function safeRead(filePath: string, maxBytes = 40_000): string {
  try {
    const buf = fs.readFileSync(filePath);
    const sliced = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
    return redactSecrets(sliced.toString("utf8"));
  } catch {
    return "";
  }
}

function collectBulletsUnderHeading(md: string, heading: string, max = 5): string[] {
  const lines = md.split(/\r?\n/);
  const target = heading.toLowerCase();

  let inSection = false;
  const bullets: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const isHeading = /^#{2,6}\s+/.test(line);

    if (isHeading) {
      const h = line.replace(/^#+\s+/, "").trim().toLowerCase();
      inSection = h === target;
      continue;
    }

    if (!inSection) continue;

    const m = line.trim().match(/^[-*]\s+(.*)$/);
    if (m?.[1]) {
      bullets.push(m[1].trim());
      if (bullets.length >= max) break;
    }
  }

  return bullets;
}

export function buildWorkingSetSummary(paths: VaultPaths, maxPerSection = 5): string {
  const ws = safeRead(paths.workingSet, 25_000);
  if (!ws) return "";

  const locked = collectBulletsUnderHeading(ws, "Locked Rules (non-negotiable)", maxPerSection);
  const focus = collectBulletsUnderHeading(ws, "Current Focus (Top 3)", maxPerSection);

  const parts: string[] = [];
  if (locked.length) parts.push("## Locked Rules\n" + locked.map((b) => `- ${b}`).join("\n"));
  if (focus.length) parts.push("## Current Focus\n" + focus.map((b) => `- ${b}`).join("\n"));

  return parts.join("\n\n").trim();
}

export function buildVaultIndexSnippet(paths: VaultPaths, maxBytes = 8_000): string {
  const vi = safeRead(paths.vaultIndex, maxBytes);
  if (!vi) return "";

  // Keep it small: first ~50 non-empty lines.
  const lines = vi
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .slice(0, 50);

  return lines.join("\n").trim();
}

export type RecallHit = { file: string; line: number; text: string };

export function simpleSearch(paths: VaultPaths, query: string, maxHits = 7): RecallHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const hits: RecallHit[] = [];
  const searchFiles: string[] = [];

  // Core files
  [paths.workingSet, paths.vaultIndex, paths.memoryMd].forEach((f) => searchFiles.push(f));

  // Recent daily files (best-effort): last 7 by name sort
  try {
    const files = fs
      .readdirSync(paths.dailyDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .slice(-7)
      .map((f) => path.join(paths.dailyDir, f));
    searchFiles.push(...files);
  } catch {
    // ignore
  }

  // Anchors (small-ish)
  try {
    const files = fs
      .readdirSync(paths.anchorsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => path.join(paths.anchorsDir, f));
    searchFiles.push(...files);
  } catch {
    // ignore
  }

  for (const file of searchFiles) {
    if (hits.length >= maxHits) break;
    const content = safeRead(file, 120_000);
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.toLowerCase().includes(q)) {
        hits.push({ file, line: i + 1, text: line.trim() });
        if (hits.length >= maxHits) break;
      }
    }
  }

  return hits;
}

function todayDailyFile(paths: VaultPaths, now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(paths.dailyDir, `${y}-${m}-${d}.md`);
}

function todayRawFile(paths: VaultPaths, now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(paths.rawDir, `${y}-${m}-${d}.jsonl`);
}

export function appendRemember(paths: VaultPaths, text: string): { file: string } {
  const dailyFile = todayDailyFile(paths);
  fs.mkdirSync(paths.dailyDir, { recursive: true });

  const line = redactSecrets(text).trim();
  const entry = `\n- [remember] ${line}\n`;
  fs.appendFileSync(dailyFile, entry, "utf8");
  return { file: dailyFile };
}

export type RawTurnRecord = {
  ts: string;
  sessionKey?: string;
  channel?: string;
  roleBlocks: { role: string; text: string }[];
};

export function appendRawTurn(paths: VaultPaths, rec: RawTurnRecord): { file: string } {
  fs.mkdirSync(paths.rawDir, { recursive: true });
  const file = todayRawFile(paths);

  // redact secrets in text blocks
  const safe: RawTurnRecord = {
    ...rec,
    roleBlocks: (rec.roleBlocks || []).map((b) => ({
      role: b.role,
      text: redactSecrets(String(b.text || "")),
    })),
  };

  fs.appendFileSync(file, JSON.stringify(safe) + "\n", "utf8");
  return { file };
}

function appendUnderHeading(filePath: string, heading: string, bullet: string) {
  let md = "";
  try {
    md = fs.readFileSync(filePath, "utf8");
  } catch {
    md = `# ${path.basename(filePath)}\n\n`;
  }

  if (!md.includes(heading)) {
    md = md.trimEnd() + `\n\n${heading}\n`;
  }

  // Append at end; keep it simple and non-destructive.
  const entry = `- ${bullet.trim()}\n`;
  fs.writeFileSync(filePath, md.trimEnd() + "\n" + entry, "utf8");
}

export function appendToCommitments(paths: VaultPaths, text: string): { file: string } {
  const file = paths.memoryMd;
  const bullet = redactSecrets(text).trim();
  appendUnderHeading(file, "## ✅ Commitments", bullet);
  return { file };
}

export function appendToLessons(paths: VaultPaths, text: string): { file: string } {
  const file = paths.memoryMd;
  const bullet = redactSecrets(text).trim();
  appendUnderHeading(file, "## 📚 Lessons", bullet);
  return { file };
}

export function appendToPreferences(paths: VaultPaths, text: string): { file: string } {
  const file = paths.memoryMd;
  const bullet = redactSecrets(text).trim();
  appendUnderHeading(file, "## 🎛 Preferences", bullet);
  return { file };
}

function nextDecisionId(decisionsMd: string, ymd: string): string {
  const re = new RegExp(`\\bD-${ymd}-(\\d{3})\\b`, "g");
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decisionsMd))) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  const next = String(max + 1).padStart(3, "0");
  return `D-${ymd}-${next}`;
}

export function appendDecision(paths: VaultPaths, text: string): { file: string; id: string } {
  const file = path.join(paths.anchorsDir, "DECISIONS.md");
  fs.mkdirSync(paths.anchorsDir, { recursive: true });

  let md = "";
  try {
    md = fs.readFileSync(file, "utf8");
  } catch {
    md = "# DECISIONS — Ledger\n\n";
  }

  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const id = nextDecisionId(md, ymd);

  const line = redactSecrets(text).trim();
  const entry = `\n## ${id}\n- Date: ${now.toISOString().slice(0, 10)}\n- Decision: ${line}\n`;

  fs.appendFileSync(file, entry, "utf8");
  return { file, id };
}
