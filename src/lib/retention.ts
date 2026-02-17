import fs from "node:fs";
import path from "node:path";
import type { VaultPaths } from "./fsVault.js";

export type RetentionConfig = {
  retentionDays: number;
  manifestMaxFiles: number;
  promotionLedgerMaxBytes: number;
};

export type CleanupTargetResult = {
  scanned: number;
  kept: number;
  deleted: number;
  rewritten: boolean;
  bytesBefore?: number;
  bytesAfter?: number;
};

export type CleanupResult = {
  manifests: CleanupTargetResult;
  promotionLedger: CleanupTargetResult;
  dryRun: boolean;
};

function ymd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function cutoffDate(retentionDays: number, now = new Date()): string {
  const ms = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return ymd(new Date(ms));
}

export function cleanupManifestFiles(paths: VaultPaths, cfg: RetentionConfig, dryRun = true): CleanupTargetResult {
  const dir = path.join(paths.root, "context", "manifests");
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort();
  } catch {
    return { scanned: 0, kept: 0, deleted: 0, rewritten: false };
  }

  const today = `${ymd()}.jsonl`;
  const cutoff = cutoffDate(Math.max(1, cfg.retentionDays));

  let keep = files.filter((f) => f === today || f.slice(0, 10) >= cutoff);
  if (!keep.includes(today) && files.includes(today)) keep.push(today);
  keep = Array.from(new Set(keep)).sort();

  const maxFiles = Math.max(1, cfg.manifestMaxFiles);
  if (keep.length > maxFiles) {
    const mustKeep = keep.includes(today) ? [today] : [];
    const rest = keep.filter((f) => f !== today);
    const tail = rest.slice(-Math.max(0, maxFiles - mustKeep.length));
    keep = [...mustKeep, ...tail].sort();
  }

  const keepSet = new Set(keep);
  const toDelete = files.filter((f) => !keepSet.has(f) && f !== today);

  if (!dryRun) {
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {
        // best effort
      }
    }
  }

  return {
    scanned: files.length,
    kept: keep.length,
    deleted: toDelete.length,
    rewritten: false,
  };
}

function lineDateFromLedger(line: string): string | null {
  try {
    const obj = JSON.parse(line);
    if (typeof obj?.at === "string" && /^\d{4}-\d{2}-\d{2}/.test(obj.at)) return obj.at.slice(0, 10);
  } catch {
    // ignore malformed lines
  }
  return null;
}

export function cleanupPromotionLedger(paths: VaultPaths, cfg: RetentionConfig, dryRun = true): CleanupTargetResult {
  const file = paths.promotionLedgerJsonl;
  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return { scanned: 0, kept: 0, deleted: 0, rewritten: false, bytesBefore: 0, bytesAfter: 0 };
  }

  const before = Buffer.byteLength(content, "utf8");
  const lines = content.split(/\r?\n/).filter((x) => x.trim().length > 0);
  const today = ymd();
  const cutoff = cutoffDate(Math.max(1, cfg.retentionDays));

  let kept = lines.filter((ln) => {
    const d = lineDateFromLedger(ln);
    if (!d) return false;
    return d === today || d >= cutoff;
  });

  const maxBytes = Math.max(1024, cfg.promotionLedgerMaxBytes);
  let size = Buffer.byteLength(kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
  if (size > maxBytes) {
    const todayLines = kept.filter((ln) => lineDateFromLedger(ln) === today);
    const oldLines = kept.filter((ln) => lineDateFromLedger(ln) !== today);

    while (oldLines.length > 0) {
      const probe = [...oldLines, ...todayLines].join("\n") + "\n";
      if (Buffer.byteLength(probe, "utf8") <= maxBytes) break;
      oldLines.shift();
    }
    kept = [...oldLines, ...todayLines];
    size = Buffer.byteLength(kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
  }

  const next = kept.join("\n") + (kept.length ? "\n" : "");
  const rewritten = next !== content;

  if (!dryRun && rewritten) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, "utf8");
  }

  return {
    scanned: lines.length,
    kept: kept.length,
    deleted: Math.max(0, lines.length - kept.length),
    rewritten,
    bytesBefore: before,
    bytesAfter: size,
  };
}

export function cleanupContextRetention(paths: VaultPaths, cfg: RetentionConfig, dryRun = true): CleanupResult {
  return {
    manifests: cleanupManifestFiles(paths, cfg, dryRun),
    promotionLedger: cleanupPromotionLedger(paths, cfg, dryRun),
    dryRun,
  };
}
