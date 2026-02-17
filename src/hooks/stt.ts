import type { PluginConfig } from "../config.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Detect OpenClaw inbound media paths embedded in prompt text.
// Example:
// [media attached: /home/user/.openclaw/media/inbound/file_77---....ogg (...)]
const OGG_RE = /\/(Users|home)\/[^\s\]]+\/\.openclaw\/media\/inbound\/[^\s\]]+\.ogg/gi;

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function readCached(cacheDir: string, key: string): string | null {
  const p = path.join(cacheDir, key + ".txt");
  try {
    const s = fs.readFileSync(p, "utf8");
    return s.trim() || null;
  } catch {
    return null;
  }
}

function writeCached(cacheDir: string, key: string, text: string) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const p = path.join(cacheDir, key + ".txt");
  fs.writeFileSync(p, text.trim() + "\n", "utf8");
}

function cacheKeyForFile(filePath: string): string {
  try {
    const st = fs.statSync(filePath);
    const base = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${base}__${st.size}__${Math.floor(st.mtimeMs)}`;
  } catch {
    return path.basename(filePath);
  }
}

export function buildSttHandler(cfg: PluginConfig) {
  const workspace = cfg.vaultRoot || process.cwd();
  const cacheDir = path.join(workspace, "memory", "stt_cache");
  const venvPy = path.join(workspace, ".venv-stt310", "bin", "python");
  const script = path.join(workspace, "scripts", "transcribe_audio.py");

  return async (event: Record<string, unknown>) => {
    const prompt = typeof (event as any).prompt === "string" ? String((event as any).prompt) : "";
    if (!prompt) return;

    const matches = uniq((prompt.match(OGG_RE) || []).map((m) => m.trim()));
    if (!matches.length) return;

    // Token discipline: only transcribe the first audio file referenced.
    const audioPath = matches[0]!;

    const key = cacheKeyForFile(audioPath);
    const cached = readCached(cacheDir, key);
    const transcript = cached
      ? cached
      : (() => {
          // Prefer English for Telugu/hinglish voice notes (more robust for our use).
          const out = execFileSync(venvPy, [script, "--plain", "--lang", "en", audioPath], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 120_000,
          }).trim();
          if (out) writeCached(cacheDir, key, out);
          return out;
        })();

    if (!transcript) return;

    // Keep the injected transcript small.
    const maxInject = cfg.maxInjectChars || 2500;
    const max = Math.max(300, Math.min(2000, Math.floor(maxInject / 2)));
    const clipped = transcript.length > max ? transcript.slice(0, max - 1) + "…" : transcript;

    return {
      prependContext: `<local-audio-transcript>\n${clipped}\n</local-audio-transcript>`,
    };
  };
}
