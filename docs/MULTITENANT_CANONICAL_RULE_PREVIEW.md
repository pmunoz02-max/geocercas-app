# Regla Canónica Multi-Tenant (Preview)

## 1. Fuente de verdad de org activa
- La organización activa para cualquier operación se determina por el `org_id` explícito enviado por el frontend (como `requestedOrgId` en el backend).
- Si el usuario no tiene membership en esa organización, la operación debe ser rechazada con 403.
- Solo se permite fallback (org por default/primera) si **no** se pidió org explícita.

## 2. Regla frontend
- **Obligatorio:** Toda mutación (POST, PUT, DELETE) debe enviar `org_id` explícito en el payload o query.
- Usar helpers universales (`withActiveOrg`) para asegurar que siempre se incluya el org correcto.

## 3. Regla backend
- **Obligatorio:** Todo endpoint multi-tenant debe aceptar y procesar `requestedOrgId` (de body o query).
- El backend debe validar que el usuario tiene membership en esa organización antes de ejecutar la operación.
- Si se recibe `requestedOrgId` y el usuario no tiene acceso, responder 403 **sin fallback**.
- Solo usar fallback (org por default/primera) si **no** se pidió org explícita.

## 4. Anti-patrones prohibidos
- Mutaciones (POST, PUT, DELETE) sin `org_id` en el payload/query.
- Fallback silencioso a otra organización cuando se pidió una explícita.
- Queries o mutaciones que no filtran por `.eq("org_id", ctx.org_id)` en la capa de datos.
- Cualquier lógica que derive la organización activa solo del usuario sin validación de membership.

## 5. Checklist de validación por módulo
- [ ] ¿Todas las mutaciones frontend envían `org_id`?
- [ ] ¿Todos los endpoints backend aceptan y procesan `requestedOrgId`?
- [ ] ¿Se valida membership antes de operar sobre la organización?
- [ ] ¿No hay fallback silencioso a otra org si se pidió una explícita?
- [ ] ¿Todas las queries a tablas multi-tenant filtran por `.eq("org_id", ctx.org_id)`?
- [ ] ¿Se documentan y auditan estos patrones en cada módulo?

---

> **Nota:** Esta documentación aplica solo a entornos de preview. No modificar producción sin validación y consenso.
