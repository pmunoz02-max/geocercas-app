# Fix asignaciones tenant_id legacy FK

Fecha: 2026-07-07  
Branch: preview  
Archivo principal: api/asignaciones.js

## Problema

Al guardar una asignación desde el módulo Asignaciones, Supabase devolvía:

insert or update on table "asignaciones" violates foreign key constraint "asignaciones_tenant_fk"

La estructura real de Preview confirmó que:

- asignaciones.org_id apunta al tenant canónico de la app basado en organizations.id.
- asignaciones.tenant_id es legacy, nullable, y tiene FK hacia tenants(id).
- No existen triggers activos que rellenen tenant_id en asignaciones.

El endpoint api/asignaciones.js estaba aplicando una regla incorrecta:

tenant_id = org_id

Eso provocaba que se enviara un UUID de organizations.id hacia una FK que espera tenants.id.

## Solución

Se eliminó tenant_id de los campos escribibles de api/asignaciones.js.

También se eliminaron las asignaciones automáticas:

- insertFields.tenant_id = org_id
- updateFields.tenant_id = nextOrgId

Desde este cambio, POST y PATCH sobre asignaciones deben escribir org_id como campo canónico y no deben enviar tenant_id.

## Regla permanente

Para la tabla public.asignaciones:

- Usar org_id para filtrar, crear y actualizar.
- No enviar tenant_id desde frontend ni desde api/asignaciones.js.
- No cambiar esta regla sin revisar primero la FK asignaciones_tenant_fk.

## Tablas no modificadas

No se modificó:

- activity_assignments
- tracker_assignments
- geocercas
- activities
- personal

El cambio es específico para public.asignaciones.
