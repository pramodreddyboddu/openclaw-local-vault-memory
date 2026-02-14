import fs from "node:fs";
import { redactSecrets } from "./redact.js";
import type { VaultPaths } from "./fsVault.js";

export type CommitmentStatus = "open" | "done";
export type Commitment = {
  id: string;
  status: CommitmentStatus;
  createdAt: string;
  text: string;
};

function ensureCommitments(paths: VaultPaths) {
  fs.mkdirSync(paths.anchorsDir, { recursive: true });
  if (!fs.existsSync(paths.commitmentsMd)) {
    fs.writeFileSync(
      paths.commitmentsMd,
      "# COMMITMENTS\n\n## Open\n\n## Done\n\n",
      "utf8",
    );
  }
}

function nextCommitmentId(md: string, ymd: string): string {
  const re = new RegExp(`\\bC-${ymd}-(\\d{3})\\b`, "g");
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  const next = String(max + 1).padStart(3, "0");
  return `C-${ymd}-${next}`;
}

export function addCommitment(paths: VaultPaths, text: string): Commitment {
  ensureCommitments(paths);
  const md = fs.readFileSync(paths.commitmentsMd, "utf8");

  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const id = nextCommitmentId(md, ymd);

  const entry: Commitment = {
    id,
    status: "open",
    createdAt: now.toISOString(),
    text: redactSecrets(text).trim(),
  };

  const block = `\n### ${entry.id}\n- Status: open\n- Created: ${entry.createdAt}\n- Text: ${entry.text}\n`;

  // append near end (simple): just append; listing reads all
  fs.appendFileSync(paths.commitmentsMd, block, "utf8");

  return entry;
}

export function listCommitments(paths: VaultPaths, status: CommitmentStatus, limit = 20): Commitment[] {
  ensureCommitments(paths);
  const md = fs.readFileSync(paths.commitmentsMd, "utf8");
  const lines = md.split(/\r?\n/);

  const out: Commitment[] = [];
  let cur: Partial<Commitment> | null = null;

  const flush = () => {
    if (!cur?.id || !cur.status || !cur.createdAt || !cur.text) return;
    if (cur.status === status) out.push(cur as Commitment);
  };

  for (const raw of lines) {
    const h = raw.match(/^###\s+(C-\d{8}-\d{3})\s*$/);
    if (h) {
      if (cur) flush();
      cur = { id: h[1] };
      continue;
    }
    if (!cur) continue;

    const s = raw.match(/^-\s+Status:\s+(open|done)\s*$/i);
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

  return out.slice(-limit);
}

export function markCommitmentDone(paths: VaultPaths, id: string): boolean {
  ensureCommitments(paths);
  const md = fs.readFileSync(paths.commitmentsMd, "utf8");
  const safeId = id.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&");
  const re = new RegExp(`(###\\s+${safeId}\\s*\\n-\\s+Status:\\s+)open`, "m");
  const next = md.replace(re, `$1done`);
  if (next === md) return false;
  fs.writeFileSync(paths.commitmentsMd, next, "utf8");
  return true;
}
