import fs from "node:fs";
import path from "node:path";
import type { VaultPaths } from "./fsVault.js";

export type PromotionLedgerRecord = {
  at: string;
  who: string;
  when: string;
  why: string;
  source: {
    inboxId: string;
    type: string;
    file: string;
    snippet: string;
  };
  target: {
    kind: string;
    file: string;
    ref?: string;
  };
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validatePromotionLedgerRecord(v: unknown): v is PromotionLedgerRecord {
  if (!v || typeof v !== "object") return false;
  const x = v as any;
  if (!isNonEmptyString(x.at)) return false;
  if (!isNonEmptyString(x.who)) return false;
  if (!isNonEmptyString(x.when)) return false;
  if (!isNonEmptyString(x.why)) return false;
  if (!x.source || typeof x.source !== "object") return false;
  if (!isNonEmptyString(x.source.inboxId)) return false;
  if (!isNonEmptyString(x.source.type)) return false;
  if (!isNonEmptyString(x.source.file)) return false;
  if (!isNonEmptyString(x.source.snippet)) return false;
  if (!x.target || typeof x.target !== "object") return false;
  if (!isNonEmptyString(x.target.kind)) return false;
  if (!isNonEmptyString(x.target.file)) return false;
  if (x.target.ref !== undefined && !isNonEmptyString(x.target.ref)) return false;
  return true;
}

export function appendPromotionLedger(paths: VaultPaths, rec: PromotionLedgerRecord): { file: string } {
  if (!validatePromotionLedgerRecord(rec)) {
    throw new Error("Invalid promotion ledger record");
  }

  fs.mkdirSync(path.dirname(paths.promotionLedgerJsonl), { recursive: true });
  fs.appendFileSync(paths.promotionLedgerJsonl, JSON.stringify(rec) + "\n", "utf8");
  return { file: paths.promotionLedgerJsonl };
}
