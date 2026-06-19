#!/usr/bin/env node
/**
 * run-guard.mjs — PostToolUse hook. After an edit to the SDE extraction surface, run the schema guard
 * (scripts/check_schema.py) and BLOCK (exit 2) if it fails, so a broken schema can't be ignored.
 *
 * Node is guaranteed on PATH (Claude Code runs on Node); Python is not — so we find it intelligently
 * (py -3 / python3 / python), mirroring loom-discipline's run-python.mjs. The guard LOGIC stays in the
 * repo (it imports the repo's modules); this plugin just makes it run automatically.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no/!json stdin */ }

const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
const ti = payload.tool_input || {};
const norm = String(ti.file_path || ti.path || "").replace(/\\/g, "/");

// Only fire when the schema/guard surface changed — otherwise no-op fast.
const relevant = /services\/extraction\/[^/]+\.py$/.test(norm) || /scripts\/check_schema\.py$/.test(norm);
if (!relevant) process.exit(0);

const guard = join(projectDir, "scripts", "check_schema.py");
if (!existsSync(guard)) process.exit(0); // not this repo / guard absent

const isWin = process.platform === "win32";
const candidates = isWin
  ? [["py", ["-3", guard]], ["python", [guard]], ["python3", [guard]]]
  : [["python3", [guard]], ["python", [guard]]];

let res = null;
for (const [cmd, args] of candidates) {
  const r = spawnSync(cmd, args, { cwd: projectDir, encoding: "utf8" });
  if (r.error && r.error.code === "ENOENT") continue; // this python isn't on PATH — try next
  res = r;
  break;
}
if (!res) {
  console.error("[sde-guard] no Python on PATH (tried py -3, python3, python); schema guard skipped");
  process.exit(0); // never block on a missing interpreter
}

if (res.status !== 0) {
  console.error(
    "*** SDE SCHEMA GUARD FAILED — do not ship this change ***\n" +
      (res.stdout || "") + (res.stderr || ""),
  );
  process.exit(2); // surface the broken schema to Claude (PostToolUse exit 2 = blocking feedback)
}
console.error("[sde-guard] schema guard passed");
process.exit(0);
