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
  memoryTierDir: string;
  memoryTierFactDir: string;
  memoryTierEpisodicDir: string;
  memoryTierUserDir: string;
  promotionLedgerJsonl: string;
};

export function resolveVaultPaths(vaultRoot: string): VaultPaths {
  const root = vaultRoot;
  const anchorsDir = path.join(root, "project_anchors");
  const memoryTierDir = path.join(root, "context", "memory");

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
    memoryTierDir,
    memoryTierFactDir: path.join(memoryTierDir, "fact"),
    memoryTierEpisodicDir: path.join(memoryTierDir, "episodic"),
    memoryTierUserDir: path.join(memoryTierDir, "user"),
    promotionLedgerJsonl: path.join(memoryTierDir, "promotion_ledger.jsonl"),
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

  const lines = vi
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .slice(0, 50);

  return lines.join("\n").trim();
}

export type RecallHit = {
  file: string;
  line: number;
  text: string;
  source: "tier:user" | "tier:fact" | "tier:episodic" | "legacy";
};

const TIER_PRIORITY: Array<{ source: RecallHit["source"]; dirName?: "user" | "fact" | "episodic" }> = [
  { source: "tier:user", dirName: "user" },
  { source: "tier:fact", dirName: "fact" },
  { source: "tier:episodic", dirName: "episodic" },
  { source: "legacy" },
];

function listTierMarkdownFiles(paths: VaultPaths): Array<{ source: RecallHit["source"]; file: string }> {
  const dirs: Array<{ dir: string; source: RecallHit["source"] }> = [
    { dir: paths.memoryTierUserDir, source: "tier:user" },
    { dir: paths.memoryTierFactDir, source: "tier:fact" },
    { dir: paths.memoryTierEpisodicDir, source: "tier:episodic" },
  ];

  const out: Array<{ source: RecallHit["source"]; file: string }> = [];
  for (const d of dirs) {
    try {
      const files = fs
        .readdirSync(d.dir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) => path.join(d.dir, f));
      for (const f of files) out.push({ source: d.source, file: f });
    } catch {
      // missing tier dir is fine (backward compatibility)
    }
  }
  return out;
}

function listLegacySearchFiles(paths: VaultPaths): string[] {
  const searchFiles: string[] = [];

  [paths.workingSet, paths.vaultIndex, paths.memoryMd].forEach((f) => searchFiles.push(f));

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

  return searchFiles;
}

function normForDedupe(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function queryTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3),
    ),
  );
}

type ChunkCandidate = {
  line: number;
  text: string;
  score: number;
};

function buildChunk(lines: string[], idx: number): string {
  const out: string[] = [];
  for (let i = Math.max(0, idx - 1); i <= Math.min(lines.length - 1, idx + 1); i++) {
    const t = (lines[i] || "").trim();
    if (!t) continue;
    if (/^#{1,6}\s+/.test(t)) continue;
    out.push(t);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function scoreCandidate(text: string, q: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  let score = lower.includes(q) ? 10 : 0;
  for (const tok of tokens) {
    if (lower.includes(tok)) score += 2;
  }
  return score;
}

export function simpleSearch(paths: VaultPaths, query: string, maxHits = 7, maxChars = 1800): RecallHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = queryTokens(q);

  const tierFiles = listTierMarkdownFiles(paths);
  const legacyFiles = listLegacySearchFiles(paths).map((file) => ({ source: "legacy" as const, file }));

  const orderedFiles: Array<{ source: RecallHit["source"]; file: string }> = [];
  for (const p of TIER_PRIORITY) {
    if (p.source === "legacy") {
      orderedFiles.push(...legacyFiles);
      continue;
    }
    orderedFiles.push(...tierFiles.filter((x) => x.source === p.source));
  }

  const hits: RecallHit[] = [];
  const seen = new Set<string>();
  let usedChars = 0;

  for (const item of orderedFiles) {
    if (hits.length >= maxHits || usedChars >= maxChars) break;
    const content = safeRead(item.file, 120_000);
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    const candidates: ChunkCandidate[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] || "").toLowerCase();
      const tokenHit = tokens.length > 0 && tokens.some((t) => line.includes(t));
      if (!line.includes(q) && !tokenHit) continue;

      const chunk = buildChunk(lines, i);
      if (!chunk) continue;
      const compact = chunk.length > 160 ? (lines[i] || "").trim() : chunk;
      if (!compact) continue;
      const score = scoreCandidate(compact, q, tokens);
      if (score <= 0) continue;
      candidates.push({ line: i + 1, text: compact, score });
    }

    candidates.sort((a, b) => (b.score - a.score) || (a.line - b.line));

    for (const c of candidates) {
      const key = normForDedupe(c.text);
      if (seen.has(key)) continue;

      const projected = usedChars + c.text.length;
      if (projected > maxChars) continue;

      seen.add(key);
      hits.push({ file: item.file, line: c.line, text: c.text, source: item.source });
      usedChars = projected;

      if (hits.length >= maxHits || usedChars >= maxChars) break;
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
  let exists = true;
  try {
    md = fs.readFileSync(filePath, "utf8");
  } catch {
    exists = false;
    md = "";
  }

  const entry = `- ${bullet.trim()}\n`;

  if (!exists) {
    const header = `# ${path.basename(filePath)}\n\n${heading}\n`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, header + entry, "utf8");
    return;
  }

  if (md.includes(heading)) {
    fs.appendFileSync(filePath, entry, "utf8");
    return;
  }

  const suffix = `\n\n${heading}\n${entry}`;
  fs.appendFileSync(filePath, suffix, "utf8");
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
