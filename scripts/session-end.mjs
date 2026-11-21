// SessionEnd has ~1.5s and cannot block exit, so only hand the payload to a
// detached worker and return.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readStdinJson, log } from "./lib.mjs";

if (process.env.HARNESS_CHILD || process.env.HARNESS_HANDOFF === "off") process.exit(0);
const input = await readStdinJson();
if (!input.transcript_path) process.exit(0);
const file = join(tmpdir(), `harness-handoff-${input.session_id || Date.now()}.json`);
writeFileSync(file, JSON.stringify(input));
const worker = join(dirname(fileURLToPath(import.meta.url)), "handoff-worker.mjs");
spawn(process.execPath, [worker, file], { detached: true, stdio: "ignore", cwd: input.cwd }).unref();
log(`session-end queued ${file}`);
