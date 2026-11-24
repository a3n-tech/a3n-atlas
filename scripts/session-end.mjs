// SessionEnd has ~1.5s and cannot block exit, so only hand the payload to a
// detached worker and return.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readStdinJson, log, handoffEnabled } from "./lib.mjs";

if (process.env.HARNESS_CHILD || !handoffEnabled()) process.exit(0);
const input = await readStdinJson();
if (!input.transcript_path) process.exit(0);
// Private dir (0700) + file (0600): on a shared /tmp no one else can read or pre-create the payload.
const file = join(mkdtempSync(join(tmpdir(), "harness-handoff-")), "payload.json");
writeFileSync(file, JSON.stringify(input), { mode: 0o600 });
const worker = join(dirname(fileURLToPath(import.meta.url)), "handoff-worker.mjs");
spawn(process.execPath, [worker, file], { detached: true, stdio: "ignore", cwd: input.cwd }).unref();
log(`session-end queued ${file}`);
