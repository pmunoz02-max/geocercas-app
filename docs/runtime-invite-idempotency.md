# Runtime Invite Idempotency Fix

## Fecha
Abril 2026

## Problema

Las invitaciones de tracker (`tracker_invites`) marcadas como:
- `is_active = false`
- pero ya aceptadas (`accepted_at != null`)

eran rechazadas por el endpoint:

---

## 🚀 2. Commit correcto

Ahora sí:

```bash
git add docs/runtime-invite-idempotency.md
git add api/accept-tracker-invite.js
git commit -m "fix: idempotent invite accept + docs"
git push origin preview