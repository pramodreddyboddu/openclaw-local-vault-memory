#!/usr/bin/env node
import { parseConfig } from "../config.js";
import { resolveVaultPaths } from "../lib/fsVault.js";
import { cleanupContextRetention } from "../lib/retention.js";

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

const apply = process.argv.includes("--apply");
const vaultRoot = argValue("--vault-root") ?? process.cwd();
const cfg = parseConfig({
  vaultRoot,
  contextRetentionDays: Number(argValue("--days") || "30"),
  manifestMaxFiles: Number(argValue("--max-manifest-files") || "60"),
  promotionLedgerMaxBytes: Number(argValue("--max-ledger-bytes") || "524288"),
});

const paths = resolveVaultPaths(cfg.vaultRoot);
const result = cleanupContextRetention(
  paths,
  {
    retentionDays: cfg.contextRetentionDays,
    manifestMaxFiles: cfg.manifestMaxFiles,
    promotionLedgerMaxBytes: cfg.promotionLedgerMaxBytes,
  },
  !apply,
);

console.log(JSON.stringify({ ok: true, apply, vaultRoot: cfg.vaultRoot, result }, null, 2));
