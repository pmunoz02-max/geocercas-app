# Preview: vínculo de personal al aceptar tracker

Fecha: 2026-09-09. Proyecto: mujwsfhkocsuuahlrssn. Solo Preview.

## Causa

La aceptación creaba memberships y una sesión válida, pero no completaba personal.user_id.
send-position resuelve la persona por org_id + user_id; una asignación por personal_id
quedaba fuera de la consulta y no se guardaban posiciones. El servicio Android activo no
es prueba de que una posición se haya almacenado.

## Corrección

Migración 20260909185836_accept_tracker_invite_link_personal_preview.sql, aplicada en
Preview y registrada con ese identificador. Mantiene el contrato de la RPC y su ejecución
exclusiva por service_role. No requiere cambiar ni desplegar el endpoint o el APK.

Bajo el bloqueo existente de organizations, la RPC bloquea la persona del destinatario,
verifica correo e identidad y completa únicamente user_id nulo de esa organización.
Rechaza contradicciones, múltiples candidatos y otro personal activo ya ligado al usuario.
Los índices únicos siguen protegiendo conflictos con escritores concurrentes.

La escritura ocurre después de validar plan, cupo, owner y reintento, antes del retorno
idempotente. Así, una invitación ya aceptada todavía válida puede reparar el vínculo sin
reescribir accepted_at, crear membresías, ampliar cupos o cambiar otras organizaciones.
Una invitación sin fila personal conserva el comportamiento anterior; no crea personas.
Los bridges memberships → org_members → app_user_roles permanecen intactos.
Si una escritura posterior falla, el vínculo también se revierte.

## Validación real

- Prueba SQL personal-link.sql ejecutada primero junto a la nueva definición dentro de
  una transacción con rollback y después contra la migración aplicada: result=passed.
- Incluye vinculación inicial, reintento reparador al cupo, identidad contradictoria,
  otro personal ligado al mismo usuario, otra organización intacta, rechazo de plan/cupo,
  rollback forzado tras actualizar personal y membresías, y reintento revocado sin vínculo.
- Conserva la matriz FREE 2 / PRO 10 / Enterprise 50, owner, reactivación y permisos RPC.
- Fixtures de organizaciones restantes tras la prueba: 0.
- Permisos comprobados: SECURITY DEFINER; anon=false; authenticated=false; service_role=true.
- La restricción única de correo normalizado impide crear candidatos ambiguos en el esquema
  actual; no se eliminó esa restricción para forzar un caso de prueba artificial.

## Recuperación del registro existente

Pendiente: la revisión automática rechazó incluso la prueba con rollback sobre datos reales
por exigir autorización explícita para la organización afectada. No se ha reparado ese registro
ni se afirma que el móvil ya guarde posiciones. Tras autorización específica, completar solo
el vínculo vacío respaldado por invitación aceptada, Auth y membresía tracker activa; verificar
que el cupo no cambia y observar una posición real antes de dar seguimiento por resuelto.

La corrección permanente de la RPC sí está aplicada. Producción no se modificó.
Pruebas de handler: 29/29 aprobadas. Security advisor (nivel error): sin incidencias.
SQL de recuperación preparado, NO ejecutado: scripts/sql/repair-accepted-tracker-personal-preview.sql.
Requiere app.repair_org_id explícito dentro de una transacción; no contiene un UUID real.
