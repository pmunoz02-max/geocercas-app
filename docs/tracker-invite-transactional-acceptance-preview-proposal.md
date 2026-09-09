# Propuesta: aceptación transaccional de trackers en Preview

Fecha: 2026-09-09
Estado: propuesta, no implementada ni validada en base de datos.
Ámbito: branch preview y Supabase Preview. No autoriza cambios en producción.

## Problema y evidencia

La aceptación actual puede escribir en org_members mediante ensure_tracker_membership. El trigger inspeccionado de esa tabla sincroniza app_user_roles, pero no escribe directamente en memberships. El control de cupo inspeccionado está en memberships. El camino canónico existente es memberships → org_members → app_user_roles.

Ambas firmas actuales de ensure_tracker_membership devuelven UUID; los snapshots antiguos con retorno void no representan la definición suministrada de Preview. El handler ya elimina el fallback que escogía otro tracker solamente por org_id. Su prueba local de rechazo pasó; esto no prueba cuotas ni transacciones de BD.

## Contrato propuesto

Una única operación de BD debe validar y consumir la invitación, establecer la membresía y confirmar la aceptación dentro de la misma transacción. El endpoint valida el formato de entrada y llama a esa operación; no concede membresías mediante RPC auxiliares antes de ella. Todos los caminos, incluido un usuario previamente resuelto, pasan por la operación.

La operación recibe la prueba de posesión del token y la organización esperada. Busca la invitación por su hash y verifica que pertenece a esa organización. Nunca acepta un user_id arbitrario del cliente ni el resultado de una búsqueda solo por organización. La identidad se vincula inequívocamente al correo normalizado de la invitación y al usuario de Auth. Ausencia, ambigüedad o contradicción entre identidad y personal se rechazan sin conceder acceso. Resolver identidad no crea ni reactiva membresías.

La invitación debe existir, estar habilitada y no expirada para una primera aceptación. La comprobación de hash, identidad y organización se realiza también en reintentos. Debe distinguirse un reintento autenticado de la misma aceptación de una reutilización por otra identidad. No se registra el token, JWT ni secretos en logs.

## Secuencia transaccional y concurrencia

1. Identificar la organización de la invitación y adquirir un bloqueo transaccional por organización sobre una fila estable de organizations. Después bloquear la invitación y releer sus condiciones. Mantener el mismo orden de bloqueos en todos los caminos.
2. Resolver y verificar la identidad destinataria. Consultar la membresía existente y la identidad del owner de la organización invitante.
3. Leer y estabilizar el estado de billing y el límite efectivo de org_entitlements. FREE admite estado free o active; otros planes requieren active según la normalización ya acordada. La vista no contiene plan_status: este se obtiene de org_billing. Fila ausente, organización discordante, estado inválido o límite desconocido se rechazan.
4. Exigir max_trackers entero no negativo, respetando overrides 0 y 1. No usar fallback de catálogo ni límites hardcodeados. Un límite 0 impide una nueva aceptación que conceda acceso tracker.
5. Contar memberships activas con role tracker y revoked_at nulo. Una nueva alta, reactivación o conversión de admin a tracker consume un cupo. Una membresía tracker ya activa no consume otro. Conservarla sin escrituras innecesarias; si es una primera aceptación, sigue requiriendo validación de plan y límite. La política propuesta bloquea nuevas aceptaciones cuando el uso ya excede el límite; estar exactamente en el límite permite al tracker ya activo completar su aceptación sin ampliar uso.
6. Crear o actualizar explícitamente la fila en memberships; no escribir en paralelo en org_members o app_user_roles. Dejar que los triggers existentes propaguen rol y actividad. Marcar la invitación con identidad y fecha aceptadas en la misma transacción.
7. Confirmar únicamente si todas las escrituras y triggers terminan correctamente. Cualquier error revierte membresía, proyecciones y aceptación.

El bloqueo de esta RPC por sí solo no garantiza el cupo global: los demás caminos que aumentan trackers deben participar en el mismo protocolo. El trigger actual omite cambios exclusivamente de role, permite límite nulo y cuenta sin bloqueo explícito. La implementación debe corregir esas brechas de enforcement o impedir escrituras que las eludan. Evitar un INSERT ON CONFLICT indiscriminado: el BEFORE INSERT actual puede rechazar incluso a un tracker existente cuando el cupo está lleno. Usar ramas de existencia verificadas bajo bloqueo y actualizar solo lo necesario.

Los cambios de plan/override deben coordinarse con el mismo orden de bloqueo o con bloqueo consistente de billing para que una aceptación no use un límite obsoleto. Una reducción posterior del plan no expulsa automáticamente usuarios mediante esta propuesta; bloquea aumentos hasta cumplir el límite. Operaciones que trasladan membresías entre organizaciones deben bloquear ambas en orden estable para evitar interbloqueos.

## Reintentos, roles y sesiones

- Repetir una aceptación ya confirmada para el mismo token, organización e identidad devuelve el resultado previo sin duplicar membresías, cambiar accepted_at ni consumir cupo adicional.
- Un reintento no reactiva una membresía posteriormente revocada ni emite acceso si el plan o la membresía actuales ya no permiten la sesión. Diferenciar resultado histórico de aceptación de autorización vigente.
- Otra identidad no puede apropiarse de una invitación usada. Los reintentos permitidos tras expiración deben limitarse al reconocimiento del resultado previo, nunca a conceder acceso nuevo.
- Un owner de otra organización puede ser tracker en la invitante; no se modifica ninguna fila de otras organizaciones ni un rol global de profiles.
- El owner de la organización invitante mantiene su rol owner. Propuesta: rechazar su conversión con un conflicto explícito, sin marcar aceptación ni crear sesión tracker. No sustituir silenciosamente el rol solicitado por owner.
- Un admin de la organización invitante que acepte la invitación tracker pasa a tracker y consume cupo; no heredar privilegios de otras organizaciones. Esta regla debe documentarse en el flujo de aceptación.
- La firma JWT ocurre después del commit y de verificar la autorización vigente. No es parte de la transacción SQL. Si falla la firma o persistencia de sesión, un reintento puede recuperar la aceptación sin repetir el alta. La emisión/revocación de sesiones requiere su propia idempotencia; no presentar ambas fases como una transacción única.

## Cambios mínimos identificados

- Nueva operación transaccional de aceptación con acceso restringido al backend y validaciones internas de token, organización e identidad. No reutilizar como autorización una función accesible por nombre que acepte solo email/org/role.
- Handler accept-tracker-invite: sustituir el encadenamiento de resolución con efectos y update separado por esa operación; mantener el rechazo sin identidad y generar sesión solo tras éxito.
- Enforcement de memberships: cubrir role, falta de límite y concurrencia con el protocolo común; conservar protección del owner y los bridges existentes.
- Revisar escritores de org_members, memberships y los caminos de pairing para garantizar que no eludan ese protocolo. No declarar cumplimiento para todos los planes mientras queden vías de alta fuera del control.
- En el envío, retirar la dependencia de sincronizaciones que conceden membresía antes de aceptar. La resolución de identidad debe ser independiente del alta; no instalar la migración antigua de sync para resolver este problema.
- Documentar la política de reintentos y mapeo de errores del endpoint. No modificar catálogos, tablas ni índices sin una necesidad demostrada por implementación/pruebas.

Antes de redactar una migración, verificar en el proyecto Preview objetivo permisos efectivos de las RPC, dependencias de los escritores y compatibilidad con el esquema ya suministrado. La coincidencia del proyecto Supabase utilizado por Vercel Preview sigue pendiente de confirmar. Este documento no afirma que las funciones desplegadas sean las del checkout.

## Pruebas necesarias

### BD transaccional real, con fixtures aisladas

- FREE: primer y segundo tracker aceptados, tercero rechazado. PRO: décimo aceptado y undécimo rechazado. Enterprise: quincuagésimo aceptado y siguiente rechazado.
- Overrides 0 y 1; billing/entitlements ausentes; plan inactivo; ningún efecto persistido en rechazo.
- Dos invitaciones distintas compiten por el último cupo: exactamente una alta se confirma. Verificar con dos conexiones, no con mocks secuenciales.
- Misma invitación simultánea y reintento posterior: una membresía y accepted_at estable. Tracker ya activo al límite no se cuenta dos veces.
- Reactivación y cambio exclusivo admin → tracker respetan el cupo; otros escritores concurrentes y cambios de override respetan el protocolo.
- Identidad sin resolver con otro tracker disponible, identidad discordante, token incorrecto, invitación ajena, inactiva o expirada: rechazo sin cambios.
- Usuario ya resuelto pasa por todos los controles. Owner de otra org se acepta como tracker; owner de la invitante no se degrada; las otras organizaciones permanecen intactas.
- Error forzado después del alta y antes de marcar aceptación: rollback completo, incluidas org_members y app_user_roles.
- Reintento después de revocación no reactiva ni genera acceso; cambio de plan se revalida para emitir sesión.

### Handler con mocks

- No hay fallback por org, mutaciones separadas de membresía ni JWT ante rechazo de la operación.
- Mapeo explícito de errores de identidad, plan, cupo, owner e invitación.
- Éxito y fallo de sesión posterior al commit; reintento no vuelve a consumir cupo.
- Mantener la regresión existente de identidad sin resolver y las suites de permisos frontend y envío.

Estas pruebas están propuestas, no ejecutadas en este paso. La prueba previamente aprobada de identidad no sustituye las pruebas de concurrencia, triggers ni atomicidad.

## Entrega de este paso

Solo documentación. Sin cambios de código, ejecución de SQL, migraciones, build, push ni deploy. La implementación se realizará y verificará por pasos exclusivamente en Preview.
