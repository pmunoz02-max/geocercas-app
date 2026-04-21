# Personal Toggle: Comportamiento Determinístico

Desde abril 2026, la acción de toggle (activar/desactivar) personal es completamente determinística y robusta:

- **Backend:**
  - Al recibir `action: "toggle"`, el backend consulta el valor real de `vigente` en la base de datos para el registro solicitado.
  - Invierte ese valor y actualiza el registro.
  - Devuelve el registro actualizado en la respuesta.

- **Frontend:**
  - El botón de toggle llama a la API con `{ id, action: "toggle" }`.
  - Tras la respuesta, el frontend ejecuta `load()` para recargar la lista desde el backend.
  - No se invierte el estado localmente ni se asume el nuevo valor de `vigente` en el cliente.

**Ventaja:**
- El estado siempre refleja la verdad de la base de datos, evitando inconsistencias por concurrencia o errores de sincronización.
- El usuario ve el resultado real tras cada acción, incluso si hay cambios concurrentes.

Este flujo elimina cualquier dependencia de estado local para el campo `vigente` y garantiza que la UI siempre muestre el estado correcto tras cada toggle.
