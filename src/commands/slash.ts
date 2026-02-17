import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { PluginConfig } from "../config.js";
import { appendRemember, resolveVaultPaths, simpleSearch } from "../lib/fsVault.js";
import { getInboxById, listInbox } from "../lib/inbox.js";
import { promoteInboxEntry } from "../lib/promote.js";
import { listCommitments, markCommitmentDone } from "../lib/commitments.js";
import { cleanupContextRetention } from "../lib/retention.js";
import fs from "node:fs";
import path from "node:path";

function searchRaw(paths: ReturnType<typeof resolveVaultPaths>, query: string, maxHits = 10) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [] as { file: string; line: number; text: string }[];

  const hits: { file: string; line: number; text: string }[] = [];

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(paths.rawDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort()
      .slice(-30)
      .map((f) => path.join(paths.rawDir, f));
  } catch {
    return hits;
  }

  for (const file of files) {
    if (hits.length >= maxHits) break;
    let content = "";
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || "";
      if (line.toLowerCase().includes(q)) {
        hits.push({ file, line: i + 1, text: line.slice(0, 240) });
        if (hits.length >= maxHits) break;
      }
    }
  }

  return hits;
}

export function registerSlashCommands(api: OpenClawPluginApi, cfg: PluginConfig) {
  const paths = resolveVaultPaths(cfg.vaultRoot);

  api.registerCommand({
    name: "home",
    description: "Show Pamanu home menu (quick links + next actions).",
    handler: async (_ctx: any) => {
      const lines = [
        "Pamanu — Home",
        "",
        "Dashboards:",
        "- Mission Control: http://127.0.0.1:3005/canvas/mission_control_lite/index.html",
        "- Agent Ops:       http://127.0.0.1:3005/canvas/agent_ops/index.html",
        "",
        "Chrome Relay:",
        "- Attach tab (badge ON), then say what to do.",
        "",
        "Voice notes:",
        "- Auto-transcribe: ON (silent). Say 'show transcript' if needed.",
        "",
        "Memory:",
        `- Raw shadow log: ${paths.rawDir}/YYYY-MM-DD.jsonl`,
        `- Inbox: ${paths.inboxMd}`,
        "",
        "Quick commands:",
        "- /inbox (list staged captures)",
        "- /shadow <query> (search raw logs)",
        "- /remember <note>",
      ];
      return { text: lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "remember",
    description: "Save a note to local filesystem memory (daily log).",
    // PluginCommandHandler signature may evolve; keep this robust.
    handler: async (ctx: any) => {
      const text = String(ctx?.text ?? ctx?.args?.text ?? "").trim();
      if (!text) return { text: "Usage: /remember <text>" };
      const res = appendRemember(paths, text);
      return { text: `Saved to ${res.file}` };
    },
  });

  api.registerCommand({
    name: "recall",
    description: "Search local filesystem memory (curated files).",
    handler: async (ctx: any) => {
      const q = String(ctx?.text ?? ctx?.args?.text ?? "").trim();
      if (!q) return { text: "Usage: /recall <query>" };
      const hits = simpleSearch(paths, q, cfg.recallMaxHits, cfg.recallSearchMaxChars);
      if (hits.length === 0) return { text: "No matches." };
      const lines = hits.map((h) => `- ${h.text}\n  (${h.source} | ${h.file}:${h.line})`);
      return { text: `Matches for: ${q}\n\n${lines.join("\n")}` };
    },
  });

  api.registerCommand({
    name: "shadow",
    description: "Search raw shadow transcript logs (memory/raw/*.jsonl).",
    handler: async (ctx: any) => {
      const q = String(ctx?.text ?? ctx?.args?.text ?? "").trim();
      if (!q) return { text: "Usage: /shadow <query>" };
      const hits = searchRaw(paths, q, 10);
      if (hits.length === 0) return { text: "No matches in raw logs." };
      const lines = hits.map((h) => `- ${h.text}\n  (${h.file}:${h.line})`);
      return { text: `Raw matches for: ${q}\n\n${lines.join("\n")}` };
    },
  });

  api.registerCommand({
    name: "inbox",
    description: "List recent auto-captured candidate memories (staging).",
    handler: async (ctx: any) => {
      const n = Number(String(ctx?.text ?? ctx?.args?.text ?? "").trim() || "10");
      const limit = Number.isFinite(n) ? Math.max(1, Math.min(25, n)) : 10;
      const items = listInbox(paths, limit);
      if (items.length === 0) return { text: "Inbox is empty." };
      const lines = items
        .map((e) => `- ${e.id} (${e.type}) [${e.status}] — ${e.text.slice(0, 120)}`)
        .join("\n");
      return {
        text: `Memory Inbox (last ${items.length})\n\n${lines}\n\nUse /promote <id> to promote one.`,
      };
    },
  });

  api.registerCommand({
    name: "promote",
    description: "Promote a candidate memory from inbox into long-term files (manual approval).",
    handler: async (ctx: any) => {
      const id = String(ctx?.text ?? ctx?.args?.text ?? "").trim();
      if (!id) return { text: "Usage: /promote <M-YYYYMMDD-###>" };

      const entry = getInboxById(paths, id);
      if (!entry) return { text: `Not found in inbox: ${id}` };
      if (entry.status === "promoted") return { text: `Already promoted: ${id}` };

      const res = promoteInboxEntry(paths, entry, { who: "manual:/promote", why: "user-approved-manual-promotion" });
      return { text: res.message };
    },
  });

  api.registerCommand({
    name: "commitments",
    description: "List open commitments (shadow follow-ups).",
    handler: async (ctx: any) => {
      const items = listCommitments(paths, "open", 20);
      if (items.length === 0) return { text: "No open commitments." };
      const lines = items
        .slice(-20)
        .map((c) => `- ${c.id} — ${c.text.slice(0, 140)}`)
        .join("\n");
      return {
        text: `Open commitments (${items.length})\n\n${lines}\n\nUse /done <id> to close one.`,
      };
    },
  });

  api.registerCommand({
    name: "memory-clean",
    description: "Prune old context manifests + promotion ledger (safe; keeps current-day records).",
    handler: async (ctx: any) => {
      const mode = String(ctx?.text ?? ctx?.args?.text ?? "").trim().toLowerCase();
      const dryRun = mode !== "apply";
      const res = cleanupContextRetention(
        paths,
        {
          retentionDays: cfg.contextRetentionDays,
          manifestMaxFiles: cfg.manifestMaxFiles,
          promotionLedgerMaxBytes: cfg.promotionLedgerMaxBytes,
        },
        dryRun,
      );

      return {
        text:
          `${dryRun ? "Dry run" : "Applied"} memory cleanup\n` +
          `- manifests: scanned=${res.manifests.scanned}, kept=${res.manifests.kept}, deleted=${res.manifests.deleted}\n` +
          `- promotion_ledger: scanned=${res.promotionLedger.scanned}, kept=${res.promotionLedger.kept}, deleted=${res.promotionLedger.deleted}, bytes=${res.promotionLedger.bytesBefore ?? 0}->${res.promotionLedger.bytesAfter ?? 0}\n` +
          `- safety: current-day manifest + ledger records are always preserved\n` +
          `Usage: /memory-clean [apply]`,
      };
    },
  });

  api.registerCommand({
    name: "done",
    description: "Mark a commitment as done.",
    handler: async (ctx: any) => {
      const id = String(ctx?.text ?? ctx?.args?.text ?? "").trim();
      if (!id) return { text: "Usage: /done <C-YYYYMMDD-###>" };
      const ok = markCommitmentDone(paths, id);
      return { text: ok ? `Marked done: ${id}` : `Not found/open: ${id}` };
    },
  });
}
