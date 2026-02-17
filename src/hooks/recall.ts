import type { PluginConfig } from "../config.js";
import {
  buildVaultIndexSnippet,
  buildWorkingSetSummary,
  resolveVaultPaths,
  simpleSearch,
} from "../lib/fsVault.js";
import { buildSearchCandidates, emitContextManifest, type ManifestFileDecision } from "../lib/contextManifest.js";

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

    const sessionKey = String((event as any).sessionKey || (event as any).session?.key || "").trim();
    const triggerMatched = shouldInject(prompt);

    // Only do broader search on explicit trigger words.
    const pLower = prompt.toLowerCase();
    const deep = triggerMatched && TRIGGERS.some((t) => pLower.includes(t));

    const { recentDaily, anchors } = buildSearchCandidates(paths);
    const loaded: ManifestFileDecision[] = [];
    const skipped: ManifestFileDecision[] = [];

    // Quiet by default for recall injection, but still emit traceability manifest.
    if (!triggerMatched) {
      skipped.push({ path: paths.workingSet, reasons: ["relevance", "token_budget"] });
      skipped.push({ path: paths.vaultIndex, reasons: ["relevance", "token_budget"] });
      skipped.push({ path: paths.memoryMd, reasons: ["relevance", "token_budget"] });
      for (const f of recentDaily) skipped.push({ path: f, reasons: ["relevance", "token_budget"] });
      for (const f of anchors) skipped.push({ path: f, reasons: ["relevance", "token_budget"] });

      emitContextManifest(paths, {
        sessionKey,
        loaded,
        skipped,
        deepRecall: false,
        triggerMatched: false,
        maxInjectChars: cfg.maxInjectChars,
      });
      return;
    }

    // Token discipline: for "project keyword" continuity injections, keep it small.
    // Vault Index + full-text search only on explicit recall-style prompts.
    const wsSummary = buildWorkingSetSummary(paths, 5);
    loaded.push({ path: paths.workingSet, reasons: ["relevance", "recency"] });

    const viSnippet = deep ? buildVaultIndexSnippet(paths, 8_000) : "";
    if (deep) loaded.push({ path: paths.vaultIndex, reasons: ["relevance", "recency"] });
    else skipped.push({ path: paths.vaultIndex, reasons: ["token_budget"] });

    const hits = deep ? simpleSearch(paths, prompt, 7) : [];
    if (deep) {
      loaded.push({ path: paths.memoryMd, reasons: ["relevance", "recency"] });
      for (const f of recentDaily) loaded.push({ path: f, reasons: ["relevance", "recency"] });
      for (const f of anchors) loaded.push({ path: f, reasons: ["relevance", "recency"] });
    } else {
      skipped.push({ path: paths.memoryMd, reasons: ["token_budget"] });
      for (const f of recentDaily) skipped.push({ path: f, reasons: ["token_budget"] });
      for (const f of anchors) skipped.push({ path: f, reasons: ["token_budget"] });
    }

    const sections: string[] = [];
    if (wsSummary) sections.push(wsSummary);
    if (viSnippet) sections.push("## Vault Index (top)\n" + viSnippet);
    if (hits.length)
      sections.push(
        "## Recall Matches\n" +
          hits.map((h) => `- ${h.text}\n  (${h.file}:${h.line})`).join("\n"),
      );

    const body = sections.join("\n\n").trim();

    emitContextManifest(paths, {
      sessionKey,
      loaded,
      skipped,
      deepRecall: deep,
      triggerMatched: true,
      maxInjectChars: cfg.maxInjectChars,
    });

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
