# Fuente canónica de autorización por organización — Preview

Fecha: 27 de julio de 2026  
Entorno: **Preview exclusivamente**  
Estado: migración, verificación SQL y QA funcional mínimo completados satisfactoriamente en Preview el 27 de julio de 2026

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

Normalización de roles legacy: owner real -> owner, admin -> admin y cualquier
otro rol legacy -> tracker.

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

## Archivos

- Migración:
  `supabase/migrations/20260727190000_membership_authorization_source_preview.sql`
- Verificación:
  `supabase/verification/20260727190000_verify_membership_authorization_preview.sql`
- Fallback:
  `supabase/rollback/20260727190000_disable_membership_transition_bridges_preview.sql`

## Resultado de aplicación

Migración, verificación SQL y QA funcional mínimo: completados satisfactoriamente en Preview.

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
9. [PENDIENTE] Hacer push únicamente a `preview` después de la validación.

Validación clave: usuario owner/admin en A aceptó invitación como tracker en B
sin perder su rol en A y sin privilegios administrativos en B.

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

## Fallback

El archivo de fallback solo desactiva los dos bridges nuevos si provocan una
regresión. No restaura funciones o políticas vulnerables. Reabrir una
vulnerabilidad no se considera un rollback aceptable.

## Restricciones

- No ejecutar en Producción.
- No hacer push a `main`.
- No activar Paddle Live.
- No promover a alias estable sin QA completo y orden expresa.
- La futura migración de Producción debe generarse desde una auditoría fresca y
  con precondiciones específicas para sus datos reales.
