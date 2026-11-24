#!/usr/bin/env python3
"""Read-only baseline: lead time (ready-for-agent label -> closing PR mergedAt) and onboarding signals.
Only runs `gh repo list`, `gh api graphql` queries (read), and `gh api` GETs."""
import json, subprocess, statistics as st
from datetime import datetime, timedelta, timezone

ORG, LABEL, DAYS = "a3n-tech", "ready-for-agent", 60
NOW = datetime.now(timezone.utc)
SINCE = NOW - timedelta(days=DAYS)
ts = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))

def gh(*a):
    return subprocess.run(["gh", *a], capture_output=True, text=True, check=True).stdout

Q = """query($o:String!,$r:String!,$c:String){repository(owner:$o,name:$r){
 issues(first:50,after:$c,states:[OPEN,CLOSED]){pageInfo{hasNextPage endCursor}
  nodes{number state closedAt
   labeled:timelineItems(first:100,itemTypes:[LABELED_EVENT]){nodes{... on LabeledEvent{createdAt label{name}}}}
   closedByPullRequestsReferences(first:10,includeClosedPrs:true){nodes{number merged mergedAt}}}}}}"""

def issues(repo):
    cur = None
    while True:
        args = ["api", "graphql", "-f", f"query={Q}", "-f", f"o={ORG}", "-f", f"r={repo}"]
        if cur: args += ["-f", f"c={cur}"]
        d = json.loads(gh(*args))["data"]["repository"]["issues"]
        yield from d["nodes"]
        if not d["pageInfo"]["hasNextPage"]: return
        cur = d["pageInfo"]["endCursor"]

def pct(v, p):
    v = sorted(v); k = (len(v) - 1) * p; f = int(k); c = min(f + 1, len(v) - 1)
    return v[f] + (v[c] - v[f]) * (k - f)

def stats(v):
    if not v: return "n=0, no data"
    return (f"n={len(v)}, median={st.median(v):.1f}h ({st.median(v)/24:.2f}d), p25={pct(v,.25):.1f}h, "
            f"p75={pct(v,.75):.1f}h, min={min(v):.1f}h, max={max(v):.1f}h")

repos = [r["name"] for r in json.loads(gh("repo", "list", ORG, "--limit", "100", "--json", "name"))]
allv, out = [], []
for repo in sorted(repos):
    vals, nolink, total = [], [], 0
    try:
        for i in issues(repo):
            ev = [ts(n["createdAt"]) for n in i["labeled"]["nodes"] if n and n["label"]["name"] == LABEL]
            ev = [e for e in ev if e >= SINCE]
            if not ev: continue
            total += 1
            first = min(ev)  # first labeling in window
            prs = [p for p in i["closedByPullRequestsReferences"]["nodes"] if p["merged"] and p["mergedAt"]]
            if not prs: nolink.append(i["number"]); continue
            h = (min(ts(p["mergedAt"]) for p in prs) - first).total_seconds() / 3600
            vals.append(h)
    except subprocess.CalledProcessError as e:
        out.append(f"- {repo}: query failed ({e.stderr.strip()[:120]})"); continue
    allv += vals
    out.append(f"- {repo}: labeled issues={total}; with merged closing PR: {stats(vals)}; no linked merged PR={len(nolink)} {nolink}")
print(f"window: {SINCE:%F} to {NOW:%F}")
print("\n".join(out))
print("OVERALL:", stats(allv))
