// Detached from the session hooks: put a ticket on the team's GitHub Project and set its Status.
//   node project-status.mjs <repo-root> <issue-number> <status>      status: "In progress" | "Blocked"
// The project is declared in CLAUDE.md on the default branch: <!-- atlas:project <owner>/<number> -->.
// Uses the person's own gh token (needs the project scope once: gh auth refresh -s project), so no Actions minutes.
// Any failure (no project declared, no scope, no such Status option) is logged and ignored.
import { trySh, log, projectRef, repoFromUrl } from "./lib.mjs";

const [root, issueArg, status] = process.argv.slice(2);
const issue = Number(issueArg);
const ref = root && projectRef(root);
if (!ref || !Number.isInteger(issue) || issue <= 0 || !/^(In progress|Blocked)$/.test(status || "")) process.exit(0);
const repo = repoFromUrl(trySh("git", ["remote", "get-url", "origin"], { cwd: root }));
const gh = (args) => trySh("gh", args, { cwd: root, timeout: 20_000 });
const json = (args) => { try { return JSON.parse(gh(args) || "null"); } catch { return null; } };
const fail = (why) => { log(`project-status: #${issue} -> ${status}: ${why}`); process.exit(0); };

if (!repo) fail("origin is not a GitHub repo");
const url = gh(["issue", "view", String(issue), "-R", repo, "--json", "url", "-q", ".url"]);
if (!url || !/\/issues\/\d+$/.test(url)) fail("not an issue");
const projectId = gh(["project", "view", ref.number, "--owner", ref.owner, "--format", "json", "-q", ".id"]);
if (!projectId) fail(`project ${ref.owner}/${ref.number} not readable (run: gh auth refresh -s project)`);
const item = json(["project", "item-add", ref.number, "--owner", ref.owner, "--url", url, "--format", "json"]);
if (!item?.id) fail("could not add the issue to the project");
const fields = json(["project", "field-list", ref.number, "--owner", ref.owner, "--format", "json"]);
const field = fields?.fields?.find((f) => /^status$/i.test(f.name) && Array.isArray(f.options));
const option = field?.options.find((o) => o.name.toLowerCase() === status.toLowerCase());
if (!option) fail(`the project has no Status option "${status}"`);
if (gh(["project", "item-edit", "--id", item.id, "--project-id", projectId, "--field-id", field.id,
  "--single-select-option-id", option.id]) === null) fail("could not set Status");
log(`project-status: #${issue} -> ${status}`);
