---
name: role
description: Set or show the person's SDLC role(s) for the a3n-tech harness — PMO, PM, architect, frontend, backend, full-stack, DevOps, release engineer, QA/STE — which sets their angle of attack, the tickets they pick up and the skills they reach for first. Use this when someone says "I'm the frontend dev", "set my role", "what's my role", "I'm doing QA now", "switch me to release", joins the team, or when the session-start note says no role is set.
---

# Harness role

Each person holds one or more roles. The role changes **focus and tools, never the plan** — PAUL's plan
and the tickets stay shared. Roles are per person and per machine, stored outside the repo.

Roles: `pmo` (PMO / Delivery), `pm` (Project / Product Manager), `architect`, `frontend`, `backend`,
`fullstack`, `devops`, `release` (Release Engineer), `qa` (STE / QA). Lenses: `${CLAUDE_SKILL_DIR}/../../roles/<role>.md`.

## Set

1. Ask which role(s) they hold if they didn't say. Several are fine ("backend, devops").
2. Map their words to role ids (e.g. "STE" → `qa`, "project manager" → `pm`, "SRE"/"platform" → `devops`,
   "release manager" → `release`). Unknown title → ask; don't invent a role.
3. Write them, one per line:
   ```bash
   mkdir -p ~/.config/a3n-harness && printf '%s\n' <role> [<role> …] > ~/.config/a3n-harness/roles
   ```
4. Read the lens file(s) aloud in two or three lines: angle of attack, what they pick up, first skills.
   The lens loads automatically from the next session on.

## Show

`cat ~/.config/a3n-harness/roles` and summarise each lens. No file → offer to set it.

## Tickets by role

Tickets carry one `role:<id>` label (PM applies it at `/to-tickets` time). Find yours:
`gh issue list --label ready-for-agent --label role:<id>`. If the repo lacks the labels, create them:

```bash
for r in pmo pm architect frontend backend fullstack devops release qa; do
  gh label create "role:$r" --color BFD4F2 --description "Work for the $r role" 2>/dev/null || true
done
```

## Personal lens (private)

A role that isn't one of the nine (e.g. a leadership role) can be a **personal lens**: write it to
`~/.config/a3n-harness/lenses/<name>.md` (`<name>` = lowercase letters, digits, `-`) and add `<name>` to the
roles file. It loads only on that machine and is never committed or shown to anyone else. Use the
team lens format (angle of attack, pick up, reach for first, always).

Never write roles into the repo, a commit or an issue — they're personal settings.
