#!/usr/bin/env python3
"""Read-only: earliest commit adding '<!-- harness:team-rules:start' to CLAUDE.md per repo (default branch history),
and the first PR merged after it. GET requests only."""
import json, subprocess
ORG, MARK = "a3n-tech", "<!-- harness:team-rules:start"
def gh(*a):
    r = subprocess.run(["gh", *a], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None
repos = sorted(r["name"] for r in json.loads(gh("repo", "list", ORG, "--limit", "100", "--json", "name")))
for repo in repos:
    cs = gh("api", "--paginate", f"repos/{ORG}/{repo}/commits?path=CLAUDE.md&per_page=100")
    if cs is None: print(f"- {repo}: could not list CLAUDE.md commits"); continue
    cs = [c for page in cs.replace("][", "],[").split("\n") for c in json.loads(page)] if cs.strip().startswith("[") and "][" not in cs else json.loads("[" + cs.replace("][", "],[") + "]")
    cs = cs if cs and isinstance(cs[0], dict) else [c for p in cs for c in p]
    hit = None
    for c in sorted(cs, key=lambda c: c["commit"]["committer"]["date"]):
        d = json.loads(gh("api", f"repos/{ORG}/{repo}/commits/{c['sha']}") or "{}")
        for f in d.get("files", []):
            if f["filename"] == "CLAUDE.md" and any(l.startswith("+") and MARK in l for l in f.get("patch", "").split("\n")):
                hit = c; break
        if hit: break
    if not hit: print(f"- {repo}: no commit adding the marker (CLAUDE.md commits seen: {len(cs)})"); continue
    when = hit["commit"]["committer"]["date"]
    prs = json.loads(gh("api", "--paginate", f"repos/{ORG}/{repo}/pulls?state=closed&per_page=100") .replace("][", ",") or "[]")
    after = sorted(p["merged_at"] for p in prs if p.get("merged_at") and p["merged_at"] > when)
    print(f"- {repo}: marker added {when} in {hit['sha'][:7]}; first PR merged after: {after[0] if after else 'none'}")
