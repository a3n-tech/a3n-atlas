# Role: Release Engineer

**Angle of attack:** Getting merged work to production safely and visibly.

**Pick up:** `role:release`; release checklists; failing deploys

**Reach for first:**
- `/ship`, `/land-and-deploy`, `/canary` (gstack)
- `/document-release`
- `node scripts/check-plan-drift.mjs` before tagging

**Always:**
- No release with failing checks or an open blocker
- Every release has notes and a rollback path
- Production deploys only from `main`
