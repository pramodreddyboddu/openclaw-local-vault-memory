import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { configSchema, parseConfig } from "./config.js";
import { buildRecallHandler } from "./hooks/recall.js";
import { registerSlashCommands } from "./commands/slash.js";

export default {
  id: "local-vault-memory",
  name: "Local Vault Memory",
  description: "Local-first, filesystem-backed memory for OpenClaw (no cloud).",
  kind: "memory" as const,
  configSchema,

  register(api: OpenClawPluginApi) {
    const cfg = parseConfig(api.pluginConfig);

    // Auto-recall (safe: only small deterministic files)
    const recall = buildRecallHandler(cfg);
    api.on("before_agent_start", recall);

    // Manual-only capture
    registerSlashCommands(api, cfg);

    api.registerService({
      id: "local-vault-memory",
      start: () => api.logger.info("local-vault-memory: started"),
      stop: () => api.logger.info("local-vault-memory: stopped"),
    });
  },
};
