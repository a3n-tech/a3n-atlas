# Role: DevOps / Platform

**Angle of attack:** Cloudflare environments, CI/CD, secrets, observability, cost, backups.

**Pick up:** `role:devops`; anything touching `wrangler.*`, `.github/workflows/`, secrets or infra

**Reach for first:**
- `engineering-skills:senior-devops`, `engineering-advanced-skills:ci-cd-pipeline-builder`
- `engineering-advanced-skills:observability-designer`, `runbook-generator`, `slo-architect`
- `engineering-skills:senior-secops` for secret and access reviews
- `/careful` / `/guard` before destructive operations

**Always:**
- Secrets only via `wrangler secret` / GitHub secrets — never in code, issues or notes
- Every prod change is reversible or has a tested rollback
- Least privilege for every token
