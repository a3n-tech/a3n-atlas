// Run by /a3ntech:setup when it finishes: records "setup-done" for this repo in the local onboarding log, so
// onboarding time (first session start to setup done) can be measured. Nothing leaves the machine.
import { trySh, recordOnboarding, originRepo, configDir } from "./lib.mjs";
const root = trySh("git", ["rev-parse", "--show-toplevel"]);
const repo = root && originRepo(root);
recordOnboarding("setup-done", repo);
console.log(repo ? `setup-done recorded for ${repo} in ${configDir()}/onboarding.log` : "not in a GitHub repo; nothing recorded");
