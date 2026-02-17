import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  resolveVaultPaths,
  appendRemember,
  simpleSearch,
  appendDecision,
  appendToCommitments,
  appendToLessons,
  appendToPreferences,
} from "../dist/lib/fsVault.js";
import { redactSecrets } from "../dist/lib/redact.js";
import { appendInbox, listInbox, markInboxPromoted } from "../dist/lib/inbox.js";
import { addCommitment, listCommitments, markCommitmentDone } from "../dist/lib/commitments.js";
import { emitContextManifest } from "../dist/lib/contextManifest.js";
import { promoteInboxEntry } from "../dist/lib/promote.js";
import { appendPromotionLedger, validatePromotionLedgerRecord } from "../dist/lib/promotionLedger.js";

function mkVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
  fs.mkdirSync(path.join(root, "project_anchors"), { recursive: true });
  fs.mkdirSync(path.join(root, "memory"), { recursive: true });
  fs.writeFileSync(path.join(root, "MEMORY.md"), "# MEMORY\n\n## ✅ Commitments\n\n## 📚 Lessons\n", "utf8");
  fs.writeFileSync(path.join(root, "project_anchors", "WORKING_SET.md"), "# WS\n\n## Locked Rules (non-negotiable)\n- No surprises\n\n## Current Focus (Top 3)\n- Ship\n", "utf8");
  fs.writeFileSync(path.join(root, "project_anchors", "VAULT_INDEX.md"), "# VI\n- A\n", "utf8");
  return root;
}

test("redactSecrets redacts common token shapes", () => {
  const s = "sk-1234567890ABCDEFGHijklmnop sm_abcdef1234567890 eyJaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc";
  const out = redactSecrets(s);
  assert.ok(!out.includes("sk-123456"));
  assert.ok(!out.includes("sm_"));
  assert.ok(!out.includes("eyJ"));
});

test("appendRemember writes to daily log", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  const { file } = appendRemember(paths, "hello world");
  const md = fs.readFileSync(file, "utf8");
  assert.match(md, /\[remember\] hello world/);
});

test("simpleSearch finds matches across core files", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  appendRemember(paths, "alpha beta");
  const hits = simpleSearch(paths, "alpha", 5);
  assert.ok(hits.length >= 1);
});

test("tiered search priority + dedupe prefers user > fact > episodic > legacy", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);

  fs.mkdirSync(paths.memoryTierUserDir, { recursive: true });
  fs.mkdirSync(paths.memoryTierFactDir, { recursive: true });
  fs.mkdirSync(paths.memoryTierEpisodicDir, { recursive: true });

  fs.writeFileSync(path.join(paths.memoryTierEpisodicDir, "e.md"), "same line about chrome operator\n", "utf8");
  fs.writeFileSync(path.join(paths.memoryTierFactDir, "f.md"), "same line about chrome operator\n", "utf8");
  fs.writeFileSync(path.join(paths.memoryTierUserDir, "u.md"), "same line about chrome operator\n", "utf8");
  fs.writeFileSync(paths.memoryMd, "same line about chrome operator\n", "utf8");

  const hits = simpleSearch(paths, "chrome operator", 10, 500);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, "tier:user");
});

test("simpleSearch respects search token budget via maxChars", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);

  fs.mkdirSync(paths.memoryTierUserDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.memoryTierUserDir, "budget.md"),
    "budget-key " + "x".repeat(90) + "\n" + "budget-key " + "y".repeat(90) + "\n",
    "utf8"
  );

  const hits = simpleSearch(paths, "budget-key", 10, 120);
  assert.equal(hits.length, 1);
});

test("appendDecision creates DECISIONS.md and returns id", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  const res = appendDecision(paths, "Decision: use sqlite");
  assert.ok(res.id.startsWith("D-"));
  const md = fs.readFileSync(res.file, "utf8");
  assert.ok(md.includes(res.id));
});

test("appendToCommitments and appendToLessons append bullets", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  appendToCommitments(paths, "Follow up tomorrow");
  appendToLessons(paths, "Never deploy Fridays");
  const md = fs.readFileSync(paths.memoryMd, "utf8");
  assert.ok(md.includes("Follow up tomorrow"));
  assert.ok(md.includes("Never deploy Fridays"));
});

test("appendToPreferences appends bullets", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  appendToPreferences(paths, "Likes concise replies");
  const md = fs.readFileSync(paths.memoryMd, "utf8");
  assert.ok(md.includes("Likes concise replies"));
});

test("inbox append + list + promote marker", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  const e1 = appendInbox(paths, "decision", "Decision: use local-first");
  const e2 = appendInbox(paths, "lesson", "Lesson: avoid cloud keys");
  const items = listInbox(paths, 10);
  assert.ok(items.some((e) => e.id === e1.id));
  assert.ok(items.some((e) => e.id === e2.id));

  const ok = markInboxPromoted(paths, e1.id);
  assert.equal(ok, true);
  const after = listInbox(paths, 10);
  const promoted = after.find((e) => e.id === e1.id);
  assert.equal(promoted?.status, "promoted");
});

test("commitments ledger add + list + done", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  const c = addCommitment(paths, "Follow up with Pramod tomorrow");
  assert.ok(c.id.startsWith("C-"));

  const open = listCommitments(paths, "open", 50);
  assert.ok(open.some((x) => x.id === c.id));

  const ok = markCommitmentDone(paths, c.id);
  assert.equal(ok, true);
  const stillOpen = listCommitments(paths, "open", 50);
  assert.ok(!stillOpen.some((x) => x.id === c.id));
});

test("emitContextManifest writes daily jsonl with loaded/skipped context", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);

  const { file } = emitContextManifest(paths, {
    sessionKey: "session-1",
    loaded: [{ path: paths.workingSet, reasons: ["relevance", "recency"] }],
    skipped: [{ path: paths.vaultIndex, reasons: ["token_budget"] }],
    deepRecall: false,
    triggerMatched: true,
    maxInjectChars: 2500,
  });

  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const obj = JSON.parse(lines.at(-1));

  assert.equal(obj.sessionKey, "session-1");
  assert.ok(Array.isArray(obj.contextFilesLoaded));
  assert.ok(Array.isArray(obj.contextFilesSkipped));
  assert.equal(obj.contextFilesLoaded[0].path, paths.workingSet);
  assert.equal(obj.contextFilesSkipped[0].path, paths.vaultIndex);
});

test("promotion ledger append + schema validation", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);

  const entry = appendInbox(paths, "decision", "Decision: keep deterministic adapters");
  const res = promoteInboxEntry(paths, entry, { who: "manual:/promote", why: "test" });
  assert.equal(res.ok, true);

  const lines = fs.readFileSync(paths.promotionLedgerJsonl, "utf8").trim().split(/\r?\n/);
  const row = JSON.parse(lines.at(-1));

  assert.equal(validatePromotionLedgerRecord(row), true);
  assert.equal(row.source.inboxId, entry.id);
  assert.ok(row.target.file.includes("DECISIONS.md"));
  assert.ok(row.source.snippet.includes("deterministic adapters"));
});

test("promotion ledger validator rejects malformed record", () => {
  const bad = {
    at: "",
    who: "manual:/promote",
    when: "promotion",
    why: "missing source fields",
    source: { inboxId: "M-1" },
    target: { kind: "decision", file: "x.md" },
  };
  assert.equal(validatePromotionLedgerRecord(bad), false);
});

test("appendPromotionLedger throws on invalid schema", () => {
  const root = mkVault();
  const paths = resolveVaultPaths(root);
  assert.throws(() => {
    appendPromotionLedger(paths, /** @type {any} */ ({ foo: "bar" }));
  });
});
