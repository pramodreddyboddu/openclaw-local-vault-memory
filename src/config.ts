import { Type } from "@sinclair/typebox";

export const configSchema = Type.Object(
  {
    vaultRoot: Type.Optional(Type.String({ default: "/Users/pramod/clawd" })),
    maxInjectChars: Type.Optional(Type.Number({ default: 2500, minimum: 500, maximum: 20000 })),
    debug: Type.Optional(Type.Boolean({ default: false })),
  },
  { additionalProperties: false }
);

export type PluginConfig = {
  vaultRoot: string;
  maxInjectChars: number;
  debug: boolean;
};

export function parseConfig(raw: unknown): PluginConfig {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  return {
    vaultRoot: typeof obj.vaultRoot === "string" ? obj.vaultRoot : "/Users/pramod/clawd",
    maxInjectChars: typeof obj.maxInjectChars === "number" ? obj.maxInjectChars : 2500,
    debug: typeof obj.debug === "boolean" ? obj.debug : false,
  };
}
