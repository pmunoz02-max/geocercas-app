# Flujo de invitación de trackers — GeocercasApp (preview)

**Proyecto:** GeocercasApp  
**Flujo:** Invitación de trackers  
**Fecha:** Marzo 2026  
**Entorno:** preview

---

## 1. Problema anterior
- El backend dependía de `tracker_user_id`.
- Buscaba en la tabla `trackers` por email.
- Fallaba con error: `No tracker_user_id found`.
- No usaba el `assignment_id` enviado por el frontend.

## 2. Nueva lógica implementada (CANÓNICA)
- El frontend ahora envía explícitamente `assignment_id`.
- El backend valida directamente contra la tabla `asignaciones`.
- Luego valida que el email corresponda con `personal.email`.

**Definición de asignación válida:**
- `org_id` = actual
- `is_deleted` = false
- `status` o `estado` = activa
- `start_time` <= ahora
- `end_time` >= ahora

## 3. Flujo actual

**Frontend:**
- Selecciona persona válida.
- Selecciona asignación válida.
- Envía `email` + `assignment_id`.

**Backend:**
- Valida `assignment_id` (vigencia y estado).
- Obtiene `personal_id` de la asignación.
- Valida que el email coincida con `personal.email`.
- Si pasa → llama a la edge function para invitar.

## 4. Eliminaciones importantes
- Ya no se usa la tabla `trackers` para validar.
- Ya no se consulta `tracker_assignments` para este gate.
- Ya no se requiere `tracker_user_id` previo.

## 5. Beneficios
- Consistencia entre frontend y backend.
- Menos dependencia de estado previo.
- Menos errores 422 inesperados.
- Flujo más robusto y predecible.

## 6. Notas futuras
- Este flujo es base para futuras estrategias de monetización.
- Se evalúa migración futura a RPC para mayor control y performance.
