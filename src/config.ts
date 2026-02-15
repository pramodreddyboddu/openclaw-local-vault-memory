import { Type } from "@sinclair/typebox";

export const configSchema = Type.Object(
  {
    vaultRoot: Type.Optional(Type.String({ default: "/Users/pramod/clawd" })),
    maxInjectChars: Type.Optional(Type.Number({ default: 2500, minimum: 500, maximum: 20000 })),

    // Phase 1: conservative auto-capture (opt-in)
    autoCapture: Type.Optional(Type.Boolean({ default: false })),

    // captureMode:
    // - conservative: classify user text into inbox candidates
    // - everything: append verbatim last turn to daily remember log
    // - hybrid: append raw turn transcript (jsonl) + conservative inbox capture
    captureMode: Type.Optional(
      Type.Union(
        [
          Type.Literal("conservative"),
          Type.Literal("everything"),
          Type.Literal("hybrid"),
        ],
        { default: "conservative" }
      )
    ),

    // Auto-promote writes into curated long-term files (DECISIONS/MEMORY/COMMITMENTS).
    // For public release, default off. "safe" is guarded but still risky.
    autoPromote: Type.Optional(
      Type.Union([Type.Literal("off"), Type.Literal("safe")], { default: "off" })
    ),

    debug: Type.Optional(Type.Boolean({ default: false })),

    // Retention: prune staged inbox entries after N days (default 30)
    inboxRetentionDays: Type.Optional(Type.Number({ default: 30, minimum: 1, maximum: 365 })),

    // Guardrail: rate-limit auto-capture per session (seconds)
    captureCooldownSeconds: Type.Optional(Type.Number({ default: 30, minimum: 0, maximum: 3600 })),
  },
  { additionalProperties: false }
);

export type PluginConfig = {
  vaultRoot: string;
  maxInjectChars: number;
  autoCapture: boolean;
  captureMode: "conservative" | "everything" | "hybrid";
  autoPromote: "off" | "safe";
  debug: boolean;
  inboxRetentionDays: number;
  captureCooldownSeconds: number;
};

export function parseConfig(raw: unknown): PluginConfig {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const cmRaw = typeof obj.captureMode === "string" ? obj.captureMode : "conservative";
  const captureMode = cmRaw === "everything" ? "everything" : cmRaw === "hybrid" ? "hybrid" : "conservative";

  const apRaw = typeof obj.autoPromote === "string" ? obj.autoPromote : "off";
  const autoPromote = apRaw === "safe" ? "safe" : "off";

  const cds = typeof obj.captureCooldownSeconds === "number" ? obj.captureCooldownSeconds : 30;
  const captureCooldownSeconds = Number.isFinite(cds) ? Math.max(0, Math.min(3600, cds)) : 30;

  return {
    vaultRoot: typeof obj.vaultRoot === "string" ? obj.vaultRoot : "/Users/pramod/clawd",
    maxInjectChars: typeof obj.maxInjectChars === "number" ? obj.maxInjectChars : 2500,
    autoCapture: typeof obj.autoCapture === "boolean" ? obj.autoCapture : false,
    captureMode,
    autoPromote,
    debug: typeof obj.debug === "boolean" ? obj.debug : false,
    inboxRetentionDays: typeof obj.inboxRetentionDays === "number" ? obj.inboxRetentionDays : 30,
    captureCooldownSeconds,
  };
}
