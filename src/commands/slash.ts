import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { PluginConfig } from "../config.js";
import { appendRemember, resolveVaultPaths, simpleSearch } from "../lib/fsVault.js";

export function registerSlashCommands(api: OpenClawPluginApi, cfg: PluginConfig) {
  const paths = resolveVaultPaths(cfg.vaultRoot);

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
    description: "Search local filesystem memory.",
    handler: async (ctx: any) => {
      const q = String(ctx?.text ?? ctx?.args?.text ?? "").trim();
      if (!q) return { text: "Usage: /recall <query>" };
      const hits = simpleSearch(paths, q, 7);
      if (hits.length === 0) return { text: "No matches." };
      const lines = hits.map((h) => `- ${h.text}\n  (${h.file}:${h.line})`);
      return { text: `Matches for: ${q}\n\n${lines.join("\n")}` };
    },
  });
}
