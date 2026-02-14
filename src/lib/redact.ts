const TOKEN_PATTERNS: RegExp[] = [
  // OpenAI-style keys
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  // Supermemory keys
  /\bsm_[A-Za-z0-9]{10,}\b/g,
  // Google OAuth refresh tokens often look like this
  /\b1\/\/0[a-zA-Z0-9_-]{20,}\b/g,
  // JWT-ish
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}
