#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveVaultPaths } from "../lib/fsVault.js";

type Tier = "fact" | "episodic" | "user";

type BackfillItem = { tier: Tier; text: string; source: string };

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

function fileSafeRead(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function collectBullets(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((l) => l.length >= 8);
}

function parseByHeading(md: string, heading: string): string[] {
  const lines = md.split(/\r?\n/);
  const h = heading.toLowerCase();
  let on = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^#{2,6}\s+/.test(line)) {
      on = line.replace(/^#+\s+/, "").trim().toLowerCase() === h;
      continue;
    }
    if (!on) continue;
    const m = line.trim().match(/^[-*]\s+(.+)$/);
    if (m?.[1]) out.push(m[1].trim());
  }
  return out;
}

function markerId(text: string, source: string): string {
  return crypto.createHash("sha1").update(`${source}\n${text}`).digest("hex").slice(0, 12);
}

function targetFileFor(paths: ReturnType<typeof resolveVaultPaths>, tier: Tier): string {
  if (tier === "fact") return path.join(paths.memoryTierFactDir, "backfill_legacy.md");
  if (tier === "user") return path.join(paths.memoryTierUserDir, "backfill_legacy.md");
  return path.join(paths.memoryTierEpisodicDir, "backfill_legacy.md");
}

function lineFromItem(item: BackfillItem): string {
  const id = markerId(item.text, item.source);
  return `- ${item.text} <!-- backfill:${id} src:${item.source} -->`;
}

function alreadyHasMarker(content: string, item: BackfillItem): boolean {
  const id = markerId(item.text, item.source);
  return content.includes(`backfill:${id}`);
}

function collectLegacy(paths: ReturnType<typeof resolveVaultPaths>): BackfillItem[] {
  const out: BackfillItem[] = [];

  const memoryMd = fileSafeRead(paths.memoryMd);
  for (const p of parseByHeading(memoryMd, "🎛 Preferences")) out.push({ tier: "user", text: p, source: "MEMORY:preferences" });
  for (const l of parseByHeading(memoryMd, "📚 Lessons")) out.push({ tier: "fact", text: l, source: "MEMORY:lessons" });

  const decisionsFile = path.join(paths.anchorsDir, "DECISIONS.md");
  const decMd = fileSafeRead(decisionsFile);
  for (const line of decMd.split(/\r?\n/)) {
    const m = line.match(/^-\s+Decision:\s+(.+)$/i);
    if (m?.[1]) out.push({ tier: "fact", text: m[1].trim(), source: "DECISIONS" });
  }

  try {
    const files = fs
      .readdirSync(paths.dailyDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort();
    for (const f of files) {
      const md = fileSafeRead(path.join(paths.dailyDir, f));
      for (const b of collectBullets(md)) {
        out.push({ tier: "episodic", text: b, source: `daily:${f}` });
      }
    }
  } catch {
    // ignore
  }

  return out;
}

const vaultRoot = argValue("--vault-root") ?? process.cwd();
const apply = process.argv.includes("--apply");
const paths = resolveVaultPaths(vaultRoot);
const items = collectLegacy(paths);

const results: Array<{ file: string; added: number; skipped: number }> = [];
const grouped = new Map<string, BackfillItem[]>();

for (const item of items) {
  const file = targetFileFor(paths, item.tier);
  if (!grouped.has(file)) grouped.set(file, []);
  grouped.get(file)!.push(item);
}

for (const [file, batch] of grouped.entries()) {
  const before = fileSafeRead(file);
  let added = 0;
  let skipped = 0;
  const toAppend: string[] = [];

  for (const item of batch) {
    if (alreadyHasMarker(before + "\n" + toAppend.join("\n"), item)) {
      skipped++;
      continue;
    }
    toAppend.push(lineFromItem(item));
    added++;
  }

  if (apply && toAppend.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const header = before || `# backfill_legacy (${path.basename(path.dirname(file))})\n\n`;
    const suffix = (header.endsWith("\n") ? "" : "\n") + toAppend.join("\n") + "\n";
    fs.writeFileSync(file, header + suffix, "utf8");
  }

  results.push({ file, added, skipped });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apply,
      dryRun: !apply,
      safety: [
        "Idempotent: entries include stable backfill markers; reruns skip duplicates.",
        "No deletions are performed.",
        "Review dry-run output before --apply.",
      ],
      files: results,
      scannedItems: items.length,
    },
    null,
    2,
  ),
);
