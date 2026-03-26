# Multi-tenant Hardening: Reglas y Checklist (Preview)

## 1. Regla universal frontend
- **Toda mutación multi-tenant debe enviar explícitamente `org_id` en el payload o query.**
- El frontend nunca debe asumir fallback automático de organización.

## 2. Regla universal backend
- **Todo endpoint multi-tenant acepta y valida `requestedOrgId`** (extraído de payload/query).
- Si se recibe `requestedOrgId`:
  - Si el usuario tiene membership válida en esa org → continuar.
  - Si no tiene membership válida → responder 403 (prohibido fallback a otra org).
- Si no se recibe `requestedOrgId`, se permite fallback a la org activa o default.

## 3. Regla universal DB/query
- **Toda query multi-tenant debe filtrar explícitamente por `org_id`** (o `tenant_id` equivalente).
- Prohibido realizar select/update/delete multi-tenant sin filtro de organización.

## 4. Anti-patrones prohibidos
- Fallback silencioso a otra organización cuando se pidió una explícita.
- Queries multi-tenant sin `.eq("org_id", ...)` o equivalente.
- Mutaciones que no envían `org_id` desde frontend.
- Endpoints que resuelven contexto sin validar membership en la org pedida.
- Cualquier operación que mezcle datos de distintas organizaciones.

## 5. Checklist de validación por módulo

### personal
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

### asignaciones
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

### geofences/geocercas
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

### activities
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

### activity assignments
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

### attendance
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

### tracking
- [x] Todas las queries filtran por `org_id`.
- [x] Endpoints validan membership según regla universal.
- [x] Mutaciones exigen `org_id` desde frontend.

---

## Cómo detectar un org mismatch

### Síntomas típicos
- 404 engañoso (el recurso existe pero no en tu organización)
- El recurso desaparece y reaparece al cambiar de organización
- Listados funcionan pero create/delete/update falla
- Catálogos o datos de otra organización aparecen en la UI
- Acciones que parecen "no hacer nada" (por fallback silencioso)

### Diagnóstico
- Verifica que el frontend siempre envía `org_id` en mutaciones.
- Revisa que el backend responde 403 si la org no corresponde.
- Asegúrate que todas las queries multi-tenant filtran por `org_id`.

---

> **Nota:** Estas reglas aplican a todos los entornos preview y producción. El hardening multi-tenant es obligatorio para evitar fugas y operaciones cruzadas entre organizaciones.
