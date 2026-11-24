# Brain storage and retrieval: open-source options

Ticket: a3n-tech/atlas#11 (map #10). Researched 2026-11-23 from each tool's repo (README, LICENSE file, releases, commits, docs) via the GitHub API. Nothing was installed or run; anything about runtime behaviour beyond what the docs state is marked "not verified".

## Short answer

- A server is not needed for the core. Local, stdio-launched tools can search a folder of markdown with no daemon. qmd is the strongest fit. The Obsidian REST-plugin servers are weaker because they need Obsidian running.
- ai-memory fits the team adapter, with one gap that matters: per-project access exists, but as "restricted/open" grants managed by a root user, not tied to GitHub permissions, and it is a server we would have to run.
- Retrieval over the brain is solved by adopting. What remains for us is glue: how brain content gets into the tool, and the per-project access mapping.

## Comparison

| Tool | License (LICENSE file) | Latest release | Last commit | Server needed | Claude Code hookup |
|---|---|---|---|---|---|
| qmd (tobi/qmd) | MIT | v2.9.0, 2026-11-18 | 2026-11-20 | No (stdio default, HTTP optional) | Plugin or `qmd mcp` stdio entry |
| ai-memory (akitaonrails/ai-memory) | MIT | v3.6.0, 2026-11-23 | 2026-11-23 | Yes (one Rust binary server) | `install-mcp` and `install-hooks` |
| basic-memory (basicmachines-co) | AGPL-3.0 | v1.0.0, 2026-10-29 | 2026-11-24 | No for local install | `claude mcp add` or plugin |
| obsidian-mcp-server (cyanheads) | Apache-2.0 | v3.9.0, 2026-11-11 | 2026-11-11 | Needs Obsidian plus Local REST API plugin running | `claude mcp add` |
| mcp-obsidian (MarkusPfundstein) | MIT | no releases (API returns 404) | 2026-08-31 | Needs Obsidian plus Local REST API plugin running | MCP config |
| MCP reference filesystem server | Mixed MIT and Apache-2.0 transition notice, no single SPDX id | repo release v2.5.0, 2026-11-18 | 2026-11-18 | No | MCP config |

Dates come from the GitHub API (`releases` and `commits` endpoints). Repo age for context: ai-memory created 2026-05-21 (about six months old); qmd 2025-12-08; basic-memory 2024-12-02; cyanheads 2025-01-23; mcp-obsidian 2024-11-29.

## 1. Core option: MCP servers over a local markdown folder, no server

### qmd (best fit)

- Source: https://github.com/tobi/qmd . LICENSE: "MIT License, Copyright (c) 2024-2026 Tobi Lutke".
- README: "An on-device search engine ... Index your markdown notes, meeting transcripts, documentation, and knowledge bases." It combines "BM25 full-text search, vector semantic search, and LLM re-ranking, all running locally via node-llama-cpp with GGUF models."
- Plugs in: README says "By default, QMD's MCP server uses stdio (launched as a subprocess by each client)". Claude Code: `claude plugin marketplace add tobi/qmd` then `claude plugin install qmd@qmd`, or a manual `mcpServers` entry running `qmd mcp`. An HTTP mode (`qmd mcp --http`, localhost:8181) exists for a shared long-lived process.
- Maintenance: releases v2.9.0 (2026-11-18), v2.8.3 (2026-08-16), v2.5.3 (2026-05-29); last commit 2026-11-20.
- Still ours to build: choose which folders to index (the brain checkout), keep the index fresh after each pull (the README documents an embeddings step; scheduling it is ours), and any per-project scoping (it indexes what it is pointed at; collection mechanics not verified here).
- Not verified: model download size and first-run time, result quality on our brain content, behaviour on CI machines without a GPU.

### obsidian-mcp-server (cyanheads)

- LICENSE: Apache License 2.0. Release v3.9.0 (2026-11-11), last commit 2026-11-11.
- README: it works "through the Local REST API plugin" and has "folder-scoped read/write permissions built in". Claude Code: `claude mcp add obsidian-mcp-server -e OBSIDIAN_API_KEY=... -- npx -y obsidian-mcp-server`.
- Fit: needs Obsidian running with a community plugin and an API key. That conflicts with "core runs on git, GitHub and Claude Code only". Fine for someone who already uses Obsidian, not a core default.

### mcp-obsidian (MarkusPfundstein)

- LICENSE: MIT. No GitHub releases; last commit 2026-08-31 (about three months before this research).
- README: "MCP server to interact with Obsidian via the Local REST API community plugin." Same Obsidian-must-run limit, and less recent. Not recommended over the cyanheads server.

### MCP reference servers (filesystem, memory)

- Repo: https://github.com/modelcontextprotocol/servers . README: the servers "are intended as reference implementations ... not production-ready solutions". It lists Filesystem ("Secure file operations with configurable access controls") and Memory ("Knowledge graph-based persistent memory system").
- The LICENSE file opens: "The MCP project is undergoing a licensing transition from the MIT License to the Apache License, Version 2.0". The license is mixed, and the GitHub API reports no single SPDX id.
- Fit: file operations, not ranked search over markdown (not verified beyond the README description). A floor, not a retrieval answer.

## 2. ai-memory as the team adapter

Source: https://github.com/akitaonrails/ai-memory . Docs are in `docs/`.

- License: LICENSE file begins "MIT License, Copyright (c) 2026 Fabio Akita".
- Maintenance: releases v3.6.0 (2026-11-23), v3.5.2 (2026-11-23), v3.5.1 (2026-11-19), v3.5.0 (2026-11-18). Last commit 2026-11-23. 20 open issues at time of check. Very active, but single-author, six months old, and fast-moving (a 3.x line in six months, with `MIGRATION-2.0.md` and `upgrading-to-3.0.md` in docs). Breaking-change risk is real.
- How it runs: README Architecture section: "One Rust binary runs an MCP/HTTP server and owns one data directory" holding `wiki/` (markdown, versioned in git), `raw/`, `db/` (SQLite FTS5, entities, embeddings), `models/`, `logs/`. Hooks POST observations to the server. Docker, Homebrew, AUR, NixOS and install scripts are provided. docs/deploy.md states "one server per data directory, never two".
- Storage model: README: "The source of truth is a git-backed wiki of ordinary `.md` files ... The database is a derived index that can always be rebuilt from the files." docs/backup.md: the wiki directory "is a real git repository ... can be pushed to any git remote you own".
- Claude Code: supported. `ai-memory install-mcp --client claude-code --apply` and `ai-memory install-hooks --agent claude-code --apply` (README Docker section, docs/security.md). Claude Code gets a session-aware `ai-memory mcp-bridge` stdio bridge to the server.
- Access per project: docs/users.md: "single-tenant wiki data with optional multi-user attribution and opt-in per-project access control. There is no per-page RBAC or group permission model, and every project is open by default." A project can be marked restricted; then "only root, the project's creator, and users holding an explicit grant read or write it". Grants are managed by root only (`ai-memory user grant`, `ai-memory project access`); docs/design-per-project-authz.md: "Per-project administrators remain out of scope". Unscoped searches are filtered in SQL by the same rule.
- Auth: root bearer token, per-user `aim_` API keys, human password login with sessions. SSO (docs/sso.md): `ai-memory auth login oidc-device` does an OIDC device flow for hooks and CLI, but "ai-memory itself does not validate OIDC tokens against your IdP for server API access"; an OIDC-aware proxy must translate identity into its own tokens (docs/users.md describes a proxy-asserted-user bearer mode). TLS is through a reverse proxy (Caddy and Cloudflare Tunnel templates in the repo). Per docs/security.md, older installs and the Docker quick-start run without auth until `ai-memory auth enable`.
- Audit: README: "An audit log records every mutation." docs/ARCHITECTURE.md lists an `audit_log` table ("Every mutation"). Grant changes are recorded there. In multi-user mode writes carry user identity.
- Reading or replacing our git brain: it replaces rather than reads. Its wiki is its own git repo laid out as `<workspace>/<project>/<page>.md` (docs/wiki-migrations.md). It has `export-okf` and, per docs/okf.md, an "import --okf pair" for moving bundles. A documented way to point it at an existing folder of markdown as-is is not verified. Pages come from its own capture and consolidation, so our hand-written brain would need importing and mapping. The wiki can be pushed to a git remote, so GitHub could stay as a mirror (a one-way export from the server, not our current two-way flow).
- Mapping to GitHub permissions: none documented. Grants live in the server, separate from GitHub repo permissions. We would build the sync from GitHub team or repo membership to ai-memory grants (the CLI commands above exist; whether they suit automation is not verified).
- What we would still build: server hosting and TLS, the GitHub-to-grants sync, the import and structure mapping from the current brain, our secret scan on what it captures (README says capture is sanitized; details not verified against our rules), and an upgrade policy given the release pace.
- Scope caveat: hooks capture prompts and tool calls from every session. That is more than the brain seam asks for. Whether we want that capture is a question for the policy and audit seam.

## 3. Other proven options

### basic-memory (basicmachines-co)

- LICENSE: GNU Affero General Public License v3. Latest release v1.0.0 (2026-10-29), previous v0.24.x (2026-10-23); last commit 2026-11-24.
- README: "Local-first. Plain text on your disk." Cloud sync is "optional" and paid ("$15.00/mo" in the README) with shared team workspaces. Local needs Python via `uv`. Claude Code: `claude mcp add` (stdio) and a Claude Code plugin (README table).
- Fit: file-first markdown matches our brain better than ai-memory's capture model. AGPL-3.0 is a license-review item for enterprise adoption (not legal advice). Team sharing through their hosted cloud is a vendor dependency that breaks "core on git, GitHub and Claude Code only" if relied on.
- Not verified: per-project access, audit features, behaviour on a git-synced folder shared by several people.

## Recommendation

- Core: no server. Keep the brain as markdown in git and add qmd over the checked-out folder as the retrieval layer, launched per session as a stdio MCP server. The MCP filesystem server is the fallback. Trial it on the real brain before committing (not done here).
- Adapter: ai-memory for teams that need a shared server, per-project grants, audit and cross-agent handoffs. It fits the team need better than anything else checked, at the cost of running a server and a young, fast-moving dependency. Keep it behind the seam, not as a core requirement.
- Biggest gap for the map: per-project access is not tied to GitHub permissions in either path. Core still has one brain repo (per-repo permissions only). The core answer is splitting the brain per project in git; the adapter answer is sync glue to ai-memory grants.
- Avoid as defaults: the two Obsidian REST-plugin servers (need Obsidian running) and basic-memory (AGPL, cloud-centred team sharing), unless a user already chose them.

## Open questions for follow-up

1. Trial qmd on the real brain and confirm freshness and scoping.
2. Confirm ai-memory can ingest an existing markdown folder in our structure, or decide the brain moves into its layout.
3. Decide whether session-hook capture is wanted at all.
