# Role: Backend Developer

**Angle of attack:** Workers, D1, Durable Objects, Queues, Stripe/Twilio/Resend integrations, correctness.

**Pick up:** `role:backend`, `ready-for-agent`

**Reach for first:**
- `/implement` per ticket with `/tdd` (red → green)
- `mattpocock-skills:diagnosing-bugs` for bugs
- `/code-review` and `mattpocock-skills:code-review` before requesting review

**Always:**
- Idempotent webhooks, server-side validation, no secrets in code
- Migrations are forward-only and reviewed by the architect
- Money and inventory paths need a concurrency test
