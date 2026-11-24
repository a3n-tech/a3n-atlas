# Glossary

**Atlas**: the a3n-tech toolkit for an agentic scrum team. People and agents share one brain, one set of plugins and one process.

**Core**: what every Atlas install gets with no servers to run: the plugin, the git brain, the process and the session hooks.

**Adapter**: a swappable implementation that plugs into the core at a seam, for example a different tracker or a memory server.

**Seam**: a named boundary in the core where an adapter can replace the default without changing the rest of the core.

**Enterprise-adoptable**: an enterprise can run Atlas by choosing adapters at the seams, without forking the core.

**Brain**: the shared store of team context (decisions, glossary, design, research, meetings, people, session journal), one folder per project.

**Brain store**: the git repo of markdown notes that is the brain's source of truth.

**Brain index**: a search index built from the brain store. It can be rebuilt at any time and is never edited by hand.

**Handoff**: the note a session leaves on its ticket so the next person or agent continues where it stopped.

**Role lens**: the angle a person works from (PM, architect, frontend, QA and others). It changes focus and tools, never the plan.

**Lead time**: time from a ticket becoming ready for an agent to its pull request being merged.

**Onboarding time**: time from a new repo or person starting setup to doing their first real work with Atlas.
