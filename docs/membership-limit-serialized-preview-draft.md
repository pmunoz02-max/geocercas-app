# Draft: serialized membership quota in Preview

2026-09-09. Prepared only; no SQL executed, push or deploy. Acceptance code unchanged.

Replaces only enforce_membership_limit and its named trigger. Owner and bridge triggers are preserved. The guard moves from BEFORE to AFTER INSERT/UPDATE (including role). It counts the resulting rows once, so an existing UPSERT at capacity does not fail merely because PostgreSQL attempted an INSERT first. An exception rolls back the whole statement and transactional bridge writes.

Protocol: for a resulting active tracker, lock organizations with FOR NO KEY UPDATE, in UUID order for old/new orgs, then billing FOR SHARE, then the corresponding plans row FOR SHARE. Read the effective integer max_trackers from org_entitlements; absent, duplicate, null or negative means rejection. Zero is a real zero cap; one is a real one cap. Count actual active tracker memberships after acquiring locks and reject count > limit. Locks last until transaction end.

READ COMMITTED (including PostgreSQL's equivalent READ UNCOMMITTED) is required. The function is explicitly VOLATILE and counts in a separate query after waiting, so it can see the winner's commit. REPEATABLE READ/SERIALIZABLE active-tracker writes deliberately fail closed with 25001 rather than relying on an old snapshot. This compatibility change must be reviewed before applying.

NO KEY UPDATE avoids conflicting with the foreign-key KEY SHARE locks acquired by concurrent membership writers. Writers touching multiple orgs/rows should acquire all parent locks in sorted order before DML. Row locks already acquired by complex UPDATEs can still cause deadlocks: retry the entire transaction on 40P01; never treat it as successful acceptance. Lock ordering is not a guarantee of deadlock freedom for arbitrary multi-statement writers.

Billing/catalog row locks stabilize the limit while the membership transaction completes. A subsequent downgrade may leave existing usage above cap; this migration does not remove users. Subsequent active-tracker writes then reject until usage is within cap; revocation and non-tracker changes remain possible. The migration enforces numeric quota only, not plan_status or invite identity. Direct org_members writers still bypass memberships and remain pending work in the acceptance proposal.

Files: supabase/migrations/20260909145100_enforce_membership_limit_serialized_preview.sql and tests/sql/membership-limit-preview/. Tests are drafts, not executed. Their fixtures and two-connection procedure are documented in README.md. Stronger isolation, invalid source limits and owner protections still require actual DB verification.

Reference: https://www.postgresql.org/docs/current/transaction-iso.html (snapshots and transaction retries). This is a reviewed design dependency, not evidence that the draft passes database tests.

## Ejecución real en Preview — 2026-09-09

Aplicada tras autorización explícita al proyecto mujwsfhkocsuuahlrssn mediante apply_migration. Versión registrada: 20260909145100; archivo local renombrado para coincidir con el historial remoto. La descripción de borrador anterior es el diseño previo a esta aplicación.

Verificado en catálogo: trg_enforce_membership_limit es AFTER INSERT OR UPDATE OF org_id, revoked_at, user_id, role.

Pruebas reales completadas con datos sintéticos dentro de transacciones revertidas:
- transactional.sql: overrides 0/1, actualización y UPSERT existente al límite, cambio exclusivo de role, reactivación, liberación de cupo, sincronización de bridges y falta de billing. Sin errores.
- Matriz adicional: FREE acepta 2 y rechaza 3; PRO acepta 10 y rechaza 11; Enterprise acepta 50 y rechaza 51. Resultado explícito: passed.
- Protección del owner frente a cambio de rol/eliminación y rechazo de límite negativo. Resultado: passed (rechazo por constraint o enforcement).
- La creación de fixtures usó UUID generados y correos example.invalid, sin contraseñas ni correos enviados. Se hizo ROLLBACK; comprobación posterior: cero organizaciones llamadas CODEX quota rollback test.

Pendiente: prueba real con dos conexiones. La revisión automática rechazó COMMIT de los fixtures compartidos (usuarios Auth, organización y billing) por considerar que excedía la autorización de pruebas aisladas. No se ejecutó esa creación. Se necesita autorización específica para fixtures temporalmente confirmados y su eliminación posterior. No afirmar concurrencia validada.

No se hizo push, deploy de la app ni modificación de producción. La aceptación transaccional y las otras vías de escritura siguen fuera del alcance de esta migración.
## Concurrencia confirmada y limpieza — 2026-09-09

Tras autorización explícita para fixtures confirmados temporalmente, se crearon tres usuarios sintéticos sin contraseña y una organización aislada con override 1. La primera prueba mediante llamadas MCP separadas no acreditó solapamiento (B tardó 0,008 s); no se consideró prueba de concurrencia.

La ejecución válida usó dos procesos CLI simultáneos contra el proyecto Preview enlazado y una tercera conexión observadora:
- A: PID 2754971, winner_committed.
- B: PID 2754974, loser_rejected, espera medida 12,487495 segundos.
- Observador: B estaba en wait_event_type=Lock, wait_event=transactionid y pg_blocking_pids(B)=[2754971]. A mantenía abierta la transacción durante la pausa.
- A confirmó el último cupo; B rechazó la inserción con el mensaje esperado de límite y comprobó exactamente un tracker activo.

Limpieza completada y verificada: cero organizaciones, usuarios Auth, memberships, org_members, app_user_roles y filas org_billing correspondientes a estos fixtures. No se consultaron ni alteraron identidades de clientes para la prueba.

La validación acredita la competencia de dos INSERT por el último cupo. No sustituye pruebas de todos los escritores, traslados entre organizaciones, concurrencia con billing o aceptación completa. No se hizo push ni deploy de aplicación; producción permaneció fuera del alcance.