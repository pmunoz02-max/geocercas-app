# Fuente canónica de autorización por organización — Preview

Fecha: 27 de julio de 2026
Última actualización: 28 de julio de 2026
Entorno: **Preview exclusivamente**
Estado: migraciones, verificaciones SQL y QA funcional mínimo completados satisfactoriamente en Preview

## Objetivo

Cerrar las vías de escalamiento detectadas en la auditoría de Producción y
probar en Preview un modelo de autorización coherente:

```text
org_members
  ├── fuente canónica de autorización
  ├── role por organización
  ├── is_active
  └── proyecta → app_user_roles

memberships
  └── compatibilidad transitoria para escritores legacy
```

## Decisión arquitectónica

`public.org_members` pasa a ser la fuente de verdad para decidir si un usuario
es `owner` o `admin` dentro de una organización.

`public.memberships` no se elimina. Se conserva temporalmente porque todavía es
usada por funciones y rutas existentes. Un bridge proyecta sus cambios hacia
`org_members` hasta migrar todos los escritores de aplicación.

`public.app_user_roles` se considera una proyección derivada. Una membresía
canónica inactiva se elimina de esa proyección.

Normalización de roles legacy: owner real → `owner`, admin → `admin` y cualquier
otro rol legacy → `tracker`.

## Riesgos cerrados

1. Las dos sobrecargas de `is_org_admin` dejan de devolver siempre `true`.
2. La autorización administrativa exige una fila activa en `org_members`.
3. La sobrecarga que recibe `p_user_id` solo acepta al propio usuario o
   `service_role`.
4. Se eliminan las políticas `memberships_insert_self` y
   `memberships_update_own`.
5. `gc_set_default_org_for_user`, `gc_is_member_of_org` y
   `list_user_org_ids` quedan exclusivos para `service_role`.
6. `bootstrap_user_context` deja de ser ejecutable por `anon`.
7. Se revocan escrituras directas de `anon/authenticated` sobre
   `org_billing`, `memberships` y `app_user_roles`.
8. Los cambios de `org_members.role` o `org_members.is_active` actualizan
   correctamente `app_user_roles`.

## Regla tracker obligatoria

Los roles siguen siendo por organización:

- Un usuario puede ser `owner` en organización A.
- El mismo usuario puede ser `tracker` en organización B.
- Aceptar una invitación de B no modifica el rol de A.
- Dentro de una misma organización no se debe degradar automáticamente un rol
  superior.

## Archivos de la implementación inicial

- Migración:
  `supabase/migrations/20260727190000_membership_authorization_source_preview.sql`
- Verificación:
  `supabase/verification/20260727190000_verify_membership_authorization_preview.sql`
- Fallback:
  `supabase/rollback/20260727190000_disable_membership_transition_bridges_preview.sql`

## Resultado de la aplicación inicial

Migración, verificación SQL y QA funcional mínimo: completados
satisfactoriamente en Preview.

1. [COMPLETADO] Confirmar que el repositorio local está en `preview`.
2. [COMPLETADO] Revisar el SQL completo.
3. [COMPLETADO] Confirmar que Supabase CLI está enlazado a Preview.
4. [COMPLETADO] Ejecutar primero una copia o entorno de prueba de Preview si
   está disponible.
5. [COMPLETADO] Aplicar la migración en Preview.
6. [COMPLETADO] Ejecutar inmediatamente el archivo de verificación.
7. [COMPLETADO] No continuar si cualquier control devuelve `FAIL`.
8. [COMPLETADO] Probar onboarding, invitación tracker, cambio de organización,
   gestión de miembros y página Billing.
9. [COMPLETADO] Hacer push únicamente a `preview` después de la validación.

Publicación y despliegue inicial: el commit `74e3450e` fue publicado y
desplegado correctamente en Preview.

Validación clave: un usuario owner/admin en A aceptó una invitación como tracker
en B sin perder su rol en A y sin adquirir privilegios administrativos en B.

## Correcciones posteriores — 28 de julio de 2026

Después de la implementación inicial se identificaron dos problemas funcionales
en Preview:

1. Algunas RPC de organizaciones e invitaciones habían quedado neutralizadas o
   no conservaban completamente su comportamiento operacional.
2. `create_organization_for_current_user(text)` creaba la organización y su fila
   en `org_members`, pero no materializaba la fila correspondiente en
   `memberships`, requerida por `RequireOrg` y por rutas de autorización
   todavía compatibles con la arquitectura transitoria.

### Migración 20260727210000

Archivo:

`supabase/migrations/20260727210000_restore_functional_membership_rpcs_preview.sql`

Esta migración restauró las RPC funcionales relacionadas con organizaciones e
invitaciones, manteniendo la arquitectura definida:

- `org_members` como fuente canónica de membresía y autorización.
- `app_user_roles` como proyección derivada.
- `memberships` como compatibilidad transitoria.
- Roles independientes por organización.
- Protección contra degradaciones indebidas al aceptar invitaciones tracker.

La migración fue aplicada exclusivamente en Supabase Preview y registrada en
`supabase_migrations.schema_migrations`.

### Migración 20260728220000

Archivo:

`supabase/migrations/20260728220000_fix_create_organization_membership_preview.sql`

Esta migración corrigió permanentemente el onboarding de nuevas organizaciones:

- Reparó únicamente la membresía owner faltante de la organización auditada
  `Org Onboarding Preview`.
- Conservó intacta la fila válida existente en `org_members`.
- Creó la fila correspondiente en `memberships`.
- Estableció la membresía como predeterminada mediante `is_default = true`.
- Conservó `revoked_at = null`.
- Actualizó `create_organization_for_current_user(text)` para escribir tanto en
  `org_members` como en `memberships`.
- Incorporó un bloqueo transaccional por usuario para evitar condiciones de
  carrera durante la creación simultánea de organizaciones.
- Incorporó preflight y verificaciones internas para abortar la transacción si
  la estructura o los datos no coinciden con el entorno previamente auditado.

La migración fue aplicada mediante `supabase db query --linked --file` y luego
registrada como aplicada en el historial de migraciones de Preview. No se
utilizó `supabase db push`.

### Verificación del onboarding reparado

La verificación final confirmó:

| Control | Resultado |
|---|---|
| Organización | `Org Onboarding Preview` |
| Propietario | Usuario auditado correcto |
| Rol en `org_members` | `owner` |
| `org_members.is_active` | `true` |
| Rol en `memberships` | `owner` |
| `memberships.is_default` | `true` |
| `memberships.revoked_at` | `NULL` |
| RPC escribe en `org_members` | `true` |
| RPC escribe en `memberships` | `true` |

La consulta directa al historial remoto confirmó además:

- `20260727210000`: registrada en Preview con 17 sentencias.
- `20260728220000`: registrada en Preview con 6 sentencias.

Las dos migraciones fueron verificadas satisfactoriamente. No deben volver a
ejecutarse.

## QA funcional mínimo

| Escenario | Resultado esperado |
|---|---|
| Owner A consulta su organización | Acceso administrativo |
| Usuario ajeno consulta A | Sin acceso |
| Owner A acepta tracker en B | Owner en A y tracker en B |
| Tracker B intenta administrar B | Denegado |
| Membresía canónica cambia a inactiva | Desaparece de `app_user_roles` |
| Repetición de invitación tracker | Sin duplicados ni degradación |
| Usuario autenticado llama helper con UUID ajeno | Denegado |
| Cliente intenta escribir `org_billing` | Denegado |
| Usuario crea una organización | Se crean filas en ambas tablas de membresías |
| Usuario crea su primera organización | Se establece una membresía predeterminada |
| Usuario crea organizaciones posteriores | No se duplica la membresía predeterminada |

## Fallback

El archivo de fallback de la implementación inicial solo desactiva los dos
bridges nuevos si provocan una regresión. No restaura funciones o políticas
vulnerables. Reabrir una vulnerabilidad no se considera un rollback aceptable.

Las correcciones del 28 de julio contienen controles específicos del entorno
auditado y no deben revertirse ni ejecutarse nuevamente sin una auditoría
actualizada.

## Restricciones

- No ejecutar estas migraciones en Producción.
- No hacer push a `main`.
- No usar `supabase db push` para estas correcciones.
- No activar Paddle Live como parte de este trabajo.
- No promover a alias estable sin QA completo y orden expresa.
- No mezclar estas migraciones con cambios de Paddle o preparación de Producción.
- La futura migración de Producción deberá generarse desde una auditoría fresca,
  con precondiciones específicas para su estructura y sus datos reales.

## Estado final

Las correcciones de membresías y onboarding están aplicadas y verificadas en
Supabase Preview.

Producción no fue modificada.
