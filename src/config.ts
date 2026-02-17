import { Type } from "@sinclair/typebox";

export const configSchema = Type.Object(
  {
    vaultRoot: Type.Optional(Type.String({ default: "/Users/pramod/clawd" })),
    maxInjectChars: Type.Optional(Type.Number({ default: 2500, minimum: 500, maximum: 20000 })),

    // Tiered recall search controls.
    recallMaxHits: Type.Optional(Type.Number({ default: 7, minimum: 1, maximum: 40 })),
    recallSearchMaxChars: Type.Optional(Type.Number({ default: 1800, minimum: 200, maximum: 12000 })),

    autoCapture: Type.Optional(Type.Boolean({ default: false })),
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

    autoPromote: Type.Optional(
      Type.Union([Type.Literal("off"), Type.Literal("safe")], { default: "off" })
    ),

    debug: Type.Optional(Type.Boolean({ default: false })),
    inboxRetentionDays: Type.Optional(Type.Number({ default: 30, minimum: 1, maximum: 365 })),
    captureCooldownSeconds: Type.Optional(Type.Number({ default: 30, minimum: 0, maximum: 3600 })),
  },
  { additionalProperties: false }
);

export type PluginConfig = {
  vaultRoot: string;
  maxInjectChars: number;
  recallMaxHits: number;
  recallSearchMaxChars: number;
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

  const maxHitsRaw = typeof obj.recallMaxHits === "number" ? obj.recallMaxHits : 7;
  const recallMaxHits = Number.isFinite(maxHitsRaw) ? Math.max(1, Math.min(40, Math.floor(maxHitsRaw))) : 7;

  const maxCharsRaw = typeof obj.recallSearchMaxChars === "number" ? obj.recallSearchMaxChars : 1800;
  const recallSearchMaxChars = Number.isFinite(maxCharsRaw)
    ? Math.max(200, Math.min(12000, Math.floor(maxCharsRaw)))
    : 1800;

  return {
    vaultRoot: typeof obj.vaultRoot === "string" ? obj.vaultRoot : "/Users/pramod/clawd",
    maxInjectChars: typeof obj.maxInjectChars === "number" ? obj.maxInjectChars : 2500,
    recallMaxHits,
    recallSearchMaxChars,
    autoCapture: typeof obj.autoCapture === "boolean" ? obj.autoCapture : false,
    captureMode,
    autoPromote,
    debug: typeof obj.debug === "boolean" ? obj.debug : false,
    inboxRetentionDays: typeof obj.inboxRetentionDays === "number" ? obj.inboxRetentionDays : 30,
    captureCooldownSeconds,
  };
}
