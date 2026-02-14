import { Type } from "@sinclair/typebox";

export const configSchema = Type.Object(
  {
    vaultRoot: Type.Optional(Type.String({ default: "/Users/pramod/clawd" })),
    maxInjectChars: Type.Optional(Type.Number({ default: 2500, minimum: 500, maximum: 20000 })),

    // Phase 1: conservative auto-capture (opt-in)
    autoCapture: Type.Optional(Type.Boolean({ default: false })),
    captureMode: Type.Optional(
      Type.Union([Type.Literal("conservative"), Type.Literal("everything")], {
        default: "conservative",
      })
    ),

    // Shadow mode: safe auto-promote to reduce inbox backlog (still local, still guarded)
    autoPromote: Type.Optional(
      Type.Union([Type.Literal("off"), Type.Literal("safe")], { default: "off" })
    ),

    debug: Type.Optional(Type.Boolean({ default: false })),

    // Retention: prune staged inbox entries after N days (default 30)
    inboxRetentionDays: Type.Optional(Type.Number({ default: 30, minimum: 1, maximum: 365 })),
  },
  { additionalProperties: false }
);

export type PluginConfig = {
  vaultRoot: string;
  maxInjectChars: number;
  autoCapture: boolean;
  captureMode: "conservative" | "everything";
  autoPromote: "off" | "safe";
  debug: boolean;
  inboxRetentionDays: number;
};

export function parseConfig(raw: unknown): PluginConfig {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const captureModeRaw = typeof obj.captureMode === "string" ? obj.captureMode : "conservative";
  const captureMode = captureModeRaw === "everything" ? "everything" : "conservative";

  const apRaw = typeof obj.autoPromote === "string" ? obj.autoPromote : "off";
  const autoPromote = apRaw === "safe" ? "safe" : "off";

  return {
    vaultRoot: typeof obj.vaultRoot === "string" ? obj.vaultRoot : "/Users/pramod/clawd",
    maxInjectChars: typeof obj.maxInjectChars === "number" ? obj.maxInjectChars : 2500,
    autoCapture: typeof obj.autoCapture === "boolean" ? obj.autoCapture : false,
    captureMode,
    autoPromote,
    debug: typeof obj.debug === "boolean" ? obj.debug : false,
    inboxRetentionDays: typeof obj.inboxRetentionDays === "number" ? obj.inboxRetentionDays : 30,
  };
}
