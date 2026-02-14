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
} from "../dist/lib/fsVault.js";
import { redactSecrets } from "../dist/lib/redact.js";

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
