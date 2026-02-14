import type { PluginConfig } from "../config.js";
import { buildQuickContext } from "../lib/fsVault.js";
import { resolveVaultPaths } from "../lib/fsVault.js";

export function buildRecallHandler(cfg: PluginConfig) {
  const paths = resolveVaultPaths(cfg.vaultRoot);

  return async (event: Record<string, unknown>) => {
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    if (prompt.trim().length < 2) return;

    const base = buildQuickContext(paths);
    if (!base) return;

    const header =
      "The following is locally recalled context from the user's filesystem vault. Use it only when relevant.";
    let context = `<local-vault-context>\n${header}\n\n${base}\n</local-vault-context>`;

    if (context.length > cfg.maxInjectChars) {
      context = context.slice(0, cfg.maxInjectChars - 20) + "\n…\n</local-vault-context>";
    }

    return { prependContext: context };
  };
}
