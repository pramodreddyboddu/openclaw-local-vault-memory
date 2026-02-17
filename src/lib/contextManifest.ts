import fs from "node:fs";
import path from "node:path";
import type { VaultPaths } from "./fsVault.js";

export type ManifestReason = "relevance" | "recency" | "token_budget";

export type ManifestFileDecision = {
  path: string;
  reasons: ManifestReason[];
};

export type EmitManifestInput = {
  sessionKey?: string;
  loaded: ManifestFileDecision[];
  skipped: ManifestFileDecision[];
  deepRecall: boolean;
  triggerMatched: boolean;
  maxInjectChars: number;
};

function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function uniqReasons(reasons: ManifestReason[]): ManifestReason[] {
  return Array.from(new Set(reasons));
}

export function buildSearchCandidates(paths: VaultPaths): { recentDaily: string[]; anchors: string[] } {
  let recentDaily: string[] = [];
  let anchors: string[] = [];

  try {
    recentDaily = fs
      .readdirSync(paths.dailyDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .slice(-7)
      .map((f) => path.join(paths.dailyDir, f));
  } catch {
    recentDaily = [];
  }

  try {
    anchors = fs
      .readdirSync(paths.anchorsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => path.join(paths.anchorsDir, f));
  } catch {
    anchors = [];
  }

  return { recentDaily, anchors };
}

export function emitContextManifest(paths: VaultPaths, input: EmitManifestInput): { file: string } {
  const dir = path.join(paths.root, "context", "manifests");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${todayYmd()}.jsonl`);
  const record = {
    timestamp: new Date().toISOString(),
    sessionKey: input.sessionKey || "(unknown-session)",
    deepRecall: input.deepRecall,
    triggerMatched: input.triggerMatched,
    maxInjectChars: input.maxInjectChars,
    contextFilesLoaded: input.loaded.map((x) => ({ path: x.path, reasons: uniqReasons(x.reasons) })),
    contextFilesSkipped: input.skipped.map((x) => ({ path: x.path, reasons: uniqReasons(x.reasons) })),
  };

  fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
  return { file };
}
