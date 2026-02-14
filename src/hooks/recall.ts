import type { PluginConfig } from "../config.js";
import {
  buildVaultIndexSnippet,
  buildWorkingSetSummary,
  resolveVaultPaths,
  simpleSearch,
} from "../lib/fsVault.js";

const TRIGGERS = [
  "remember",
  "recall",
  "last time",
  "why",
  "decision",
  "link",
  "community",
];

function shouldInject(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (TRIGGERS.some((t) => p.includes(t))) return true;

  // Project keywords: still useful for continuity.
  if (/(chrome operator|chromeop|changelogai|desi delight|whatsapp|h1b|agent ops)/i.test(prompt)) {
    return true;
  }

  return false;
}

export function buildRecallHandler(cfg: PluginConfig) {
  const paths = resolveVaultPaths(cfg.vaultRoot);

  return async (event: Record<string, unknown>) => {
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    if (prompt.trim().length < 2) return;

    // Quiet by default.
    if (!shouldInject(prompt)) return;

    const wsSummary = buildWorkingSetSummary(paths, 5);
    const viSnippet = buildVaultIndexSnippet(paths, 8_000);

    // Only do broader search on explicit trigger words.
    const pLower = prompt.toLowerCase();
    const deep = TRIGGERS.some((t) => pLower.includes(t));
    const hits = deep ? simpleSearch(paths, prompt, 7) : [];

    const sections: string[] = [];
    if (wsSummary) sections.push(wsSummary);
    if (viSnippet) sections.push("## Vault Index (top)\n" + viSnippet);
    if (hits.length)
      sections.push(
        "## Recall Matches\n" +
          hits.map((h) => `- ${h.text}\n  (${h.file}:${h.line})`).join("\n"),
      );

    const body = sections.join("\n\n").trim();
    if (!body) return;

    const header =
      "The following is locally recalled context from the user's filesystem vault. Use it only when relevant.";
    let context = `<local-vault-context>\n${header}\n\n${body}\n</local-vault-context>`;

    if (context.length > cfg.maxInjectChars) {
      context =
        context.slice(0, Math.max(0, cfg.maxInjectChars - 25)) +
        "\n…\n</local-vault-context>";
    }

    return { prependContext: context };
  };
}
