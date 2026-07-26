# Paddle Live Readiness Audit - 2026-07-23

Fecha: 2026-07-23
Estado: Cerrada
Ámbito: Evaluación de readiness de Paddle para Live

## Resumen Ejecutivo

- Dodo es el proveedor principal vigente en Preview.
- Paddle queda bloqueado para entorno Live.
- Todo el trabajo relacionado con Paddle se mantiene exclusivamente en entorno preview.

## Decisión Operativa

Hasta nuevo aviso:

1. No se habilita Paddle en Live.
2. No se promueven cambios de Paddle desde preview a Live.
3. Las validaciones, pruebas e iteraciones continúan solo en preview.

## Hallazgos Críticos de la Auditoría Paddle

### 1) Webhook

- Riesgo detectado: cobertura incompleta de eventos críticos para ciclo de vida de suscripción y pagos.
- Riesgo detectado: el webhook de Paddle continúa con firma inválida y controles de replay no cerrados para un escenario Live endurecido.
- Riesgo detectado: manejo parcial de fallos transitorios y reintentos sin trazabilidad consolidada de reconciliación.
- Impacto: posible divergencia entre estado de Paddle y estado interno de negocio ante eventos fuera de orden o repetidos.

### 2) Autorización de Checkout

- Riesgo detectado: la autorización de creación/uso de checkout no valida suficientemente usuario, membresía, rol y org_id.
- Riesgo detectado: validaciones de contexto de sesión y ownership no finalizadas para todos los caminos de acceso.
- Impacto: posibilidad de emitir checkout en contexto incorrecto o no autorizado en escenarios límite.

### 3) Idempotencia

- Riesgo detectado: estrategia de idempotencia no consolidada de extremo a extremo (checkout, webhook, actualización de estado).
- Riesgo detectado: llaves idempotentes y deduplicación con cobertura parcial para concurrencia y reintentos.
- Impacto: riesgo de doble procesamiento, actualización duplicada de estado o inconsistencias temporales.

### 4) Variables y Configuración

- Riesgo detectado: matriz de variables de entorno (preview/live) pendiente de cierre operativo y validación automática.
- Riesgo detectado: guardrails para evitar mezcla de credenciales/endpoints entre entornos aún no completados.
- Impacto: errores de configuración con potencial de afectar seguridad, facturación o trazabilidad.

### 5) Planes y Límites

- Riesgo detectado: normalización final entre catálogo de planes, límites oficiales y reglas efectivas en runtime aún en convergencia.
- Riesgo detectado: escenarios de migración/legacy y compatibilidad de límites pendientes de validación integral.
- Impacto: asignación de entitlements/límites incorrecta en casos borde.

### 6) Rutas Residuales

- Riesgo detectado: existencia de rutas/flujo residuales de billing que deben cerrarse o aislarse antes de Live.
- Riesgo detectado: puntos de entrada legacy aún presentes que pueden introducir comportamiento no deseado.
- Impacto: ambigüedad operacional y mayor superficie de error en producción.

## Pendientes para habilitación Live de Paddle

1. Cerrar cobertura de eventos webhook, validación de firma y defensa anti-replay con pruebas de estrés.
2. Endurecer autorización de checkout para todos los contextos multi-tenant y casos de sesión.
3. Completar idempotencia end-to-end con pruebas de concurrencia y reintentos.
4. Blindar variables por entorno con validaciones de arranque y políticas de despliegue.
5. Consolidar planes/límites con matriz oficial única y pruebas de regresión funcional.
6. Eliminar o bloquear rutas residuales de billing antes de cualquier promoción a Live.

## Implementación 1: firma fail-closed

- Se implementó validación fail-closed para firma del webhook de Paddle.
- Respuesta 401 y terminación inmediata cuando:
  - Falta el header `Paddle-Signature`.
  - El formato de firma es inválido.
  - Existe mismatch entre firma recibida y firma calculada.
  - Ocurre error durante la validación de firma.
- Se eliminó el registro de firmas recibidas o calculadas en logs.
- Estado de despliegue: esta actualización aún no se desplegó en Supabase Preview.

## Implementación 2: orden de declaración en webhook

- Se reordenó el flujo interno de la función para evitar uso de `event`, `type` y `supabase` antes de su declaración.
- El bloque de idempotencia permanece igual en comportamiento y validaciones; solo cambió su posición dentro del flujo.
- No se modificó la validación de firma.
- No se modificó la lógica de negocio (ramas de transaction/subscription ni escrituras funcionales).
- Estado de despliegue: esta actualización aún no se desplegó en Supabase Preview.

## Implementación 3: idempotencia transaccional en Preview

- Se agregó migración Preview para endurecer el estado de idempotencia en `public.paddle_webhook_events`.
- Nuevas/ajustadas columnas:
  - `occurred_at` (obligatoria).
  - `status` con estados válidos: `received`, `processing`, `applied`, `failed`.
  - `processed_at` ahora nullable.
  - `attempt_count` para contabilizar intentos.
  - `last_error` para trazabilidad de fallos.
  - `updated_at` para auditoría de cambios.
- Se añadió función SQL atómica `public.claim_paddle_webhook_event(...)` para:
  - reclamar `event_id` nuevo en estado `processing` con `INSERT ... ON CONFLICT`.
  - permitir reintento cuando el estado previo es `failed`.
  - recuperar `processing` obsoleto cuando `updated_at` supera 15 minutos sin cierre.
  - rechazar reclamación cuando el evento ya está en estado no reclamable.
- Se añadieron funciones de cierre de transición desde `processing`:
  - `public.mark_paddle_webhook_event_applied(event_id)` para `processing -> applied`.
  - `public.mark_paddle_webhook_event_failed(event_id, last_error)` para `processing -> failed`.
  - ambas validan `event_id` y rechazan transiciones inválidas.
  - en `failed`, `processed_at` queda en `null` y `last_error` se normaliza (trim), vacío a `null`, con límite de 2000 caracteres.
- Se añadió trigger de mantenimiento de `updated_at` en updates.
- Se restringió ejecución de funciones de idempotencia/transición a roles `service_role` y `postgres`.
- Se revocó acceso público también sobre la función interna del trigger.
- Estado de despliegue: migración aplicada y verificada en Supabase Preview.
- Verificación operativa:
  - `migration list` en CLI 2.108.0 y 2.109.1 muestra una anomalía de emparejamiento.
  - `schema_migrations` y el esquema real de base están correctos.
  - Queda prohibido repetir `migration repair` o usar `db push` sobre este caso.

## Implementación 4: claim RPC en webhook (sin cambios de negocio)

- Se reemplazó exclusivamente el bloque de idempotencia de webhook (SELECT/INSERT directo) por llamada RPC atómica a `public.claim_paddle_webhook_event(...)`.
- El bloque ahora valida `event_id` y `occurred_at`.
- `occurred_at` se convierte/normaliza a timestamp válido antes de invocar la RPC.
- La llamada aplicada en código es:

```ts
supabase.rpc("claim_paddle_webhook_event", {
  p_event_id: eventId,
  p_event_type: type,
  p_occurred_at: occurredAtIso,
  p_received_at: new Date().toISOString(),
});
```

- Si la RPC devuelve error, el webhook responde `500`.
- Si `claimed === false`, el webhook responde `200` y termina sin ejecutar ramas de negocio; la respuesta incluye `previous_status` para informar por qué no se reclamó.
- En este paso no se inserta ni actualiza `paddle_webhook_events` de forma directa desde TypeScript.
- Se mantiene disponible una variable `eventClaimed = true` para la siguiente etapa de implementación.
- No se modificaron ramas de negocio (`transaction.completed`, `subscription.*`, etc.).

## Implementación 5: transición applied/failed en transaction.completed

- Se integró marcado de estado de idempotencia solo en la rama `transaction.completed`.
- Antes de cada `return` de error posterior al claim en esa rama, se ejecuta `mark_paddle_webhook_event_failed(...)`:
  - falta `price_id`.
  - `price_id` no soportado para el entorno.
  - no se resuelve `org_id`.
  - error de base de datos en upsert.
- Antes del `return 200` exitoso de `transaction.completed`, se ejecuta `mark_paddle_webhook_event_applied(...)`.
- Si falla la RPC que marca `failed`, se registra el error y se responde `500` incluyendo referencia al fallo original para no ocultarlo.
- No se modificaron ramas `subscription.*` ni otros caminos fuera de `transaction.completed`.

## Implementación 6: transición applied/failed en subscription.created y subscription.updated

- Se integró marcado de estado de idempotencia solo en las ramas `subscription.created` y `subscription.updated`.
- Casos que ahora marcan `failed`:
  - falta `subscription_id`.
  - falta `price_id`.
  - precio no soportado.
  - `org_id_not_resolved` (ya no se trata como `applied`).
  - error de base de datos en upsert.
- Caso que marca `applied`:
  - evento fuera de orden (`event_out_of_order`).
  - actualización exitosa de `org_billing`.
- Si falla `mark applied`, se intenta `mark failed` y se responde `500` genérico.
- Se endurecieron logs/respuestas en estas ramas:
  - no se registra `custom_data` completo (solo presencia).
  - no se exponen detalles internos al cliente (`details`, ids internos o datos de entorno) en respuestas de error.
- No se modificaron `subscription.canceled`, `subscription.paused` ni eventos desconocidos.

## Implementación 7: transición applied/failed en subscription.canceled y subscription.paused

- Se integró marcado de estado de idempotencia solo en `subscription.canceled` y `subscription.paused`.
- `org_id_not_resolved` ahora marca `failed` y responde `400`.
- `event_out_of_order` ahora marca `applied` y responde `200`.
- Error de base de datos en upsert marca `failed`.
- Actualización exitosa marca `applied`.
- Si falla `mark applied`, se intenta `mark failed` y se responde `500` genérico.
- En esta rama, la comparación de orden usa `occurredAtIso` (no `now`) y se persiste `last_paddle_event_at = occurredAtIso`.
- No se exponen detalles internos en respuestas de error y no se registra `custom_data` completo (solo presencia).
- No se modificaron los eventos desconocidos.

## Implementación 8: cierre de eventos desconocidos y catch global endurecido

- Los eventos desconocidos ahora se cierran como `applied` antes de responder `200 ignored`.
- Si falla ese cierre `applied`, se intenta marcar `failed` y se responde `500` genérico (`Event processing failed`).
- Se añadieron variables de contexto fuera del `try` para conocer si un evento fue reclamado (`claimedEventId`, `claimedSupabase`), asignadas solo tras claim exitoso.
- En el `catch` global:
  - si hubo claim exitoso, se intenta `mark_paddle_webhook_event_failed(...)`.
  - si no hubo claim, no se escribe transición de estado.
  - la respuesta al cliente es solo `{ ok: false, error: "internal_error" }`.
  - no se expone `error.message` interno.
- Se corrigió la respuesta final de cancelación/pausa para reflejar `plan_status: canceled/inactive` según el tipo de evento.

## Implementación 9: alineación de planes y límites

- `paddle-create-checkout` ahora resuelve precios por plan y entorno con cuatro variables explícitas:

```text
PADDLE_PRO_PRICE_ID_SANDBOX
PADDLE_PRO_PRICE_ID_LIVE
PADDLE_ENTERPRISE_PRICE_ID_SANDBOX
PADDLE_ENTERPRISE_PRICE_ID_LIVE
```

- El checkout solo acepta `pro` y `enterprise`; cualquier otro valor se rechaza con error controlado.
- Se corrigió el bug donde un checkout de Enterprise podía salir con precio de PRO por selección no dependiente de plan.
- El webhook de Paddle ya no duplica límites comerciales en runtime (sin límites hardcodeados en la resolución de plan por `price_id`).
- En escrituras de `org_billing`, `tracker_limit_override` queda en `null` para activar la política normal del catálogo.
- `public.plans` se mantiene como fuente oficial de límites: PRO = 10 y Enterprise = 50.
- Validación técnica completada en Preview: `deno check` y diff check aprobados.
- Alcance operativo: sin deploy adicional, sin uso de secrets Live y sin activar webhook Live.
- Todo continúa exclusivamente en Preview.
- Estado Paddle para producción se mantiene en **NO GO para Live**.

## Implementación 10: endurecimiento de paddle-create-checkout

- Se eliminó el bloque de debug previo al `try` que leía/enviaba datos de key (`[PADDLE DEBUG]`, `keyPrefix`) y su validación asociada.
- El log de entorno se normalizó para diagnóstico seguro, exponiendo solo presencia booleana de configuración:
  - `paddleEnv`.
  - `hasApiKeySandbox` y `hasApiKeyLive`.
  - `hasProPriceIdSandbox` y `hasProPriceIdLive`.
  - `hasEnterprisePriceIdSandbox` y `hasEnterprisePriceIdLive`.
- Se eliminaron logs sensibles de contenido:
  - payload completo enviado a Paddle.
  - raw response de Paddle.
  - response JSON completo de Paddle.
- Se conserva únicamente el log seguro de estado HTTP de Paddle (`PADDLE STATUS`).
- Se endurecieron respuestas públicas `500` para no exponer internals:
  - en fallo de request a Paddle: sin `paddleJson`/`rawText` en la respuesta.
  - en ausencia de `checkout_url`: sin `raw` ni payload interno.
- En el `catch` general:
  - el log registra solo `message` y `name` del error.
  - la respuesta al cliente devuelve únicamente `{ error: "internal_error" }`.
- Se corrigió redacción del comentario operativo de `success_url` con acentuación correcta.
- No se modificó la petición HTTP a Paddle ni la respuesta exitosa con `checkout_url`.
- `verify_jwt = true` quedó configurado para `paddle-create-checkout` en `supabase/config.toml`.
- Validaciones aprobadas: `deno check --no-lock` y `git diff --check`.
- El `deno.lock` generado accidentalmente fue retirado y no se incorporará.
- Alcance exclusivo en rama `preview`, sin deploy ni cambios en secrets.
- Sigue pendiente configurar `PADDLE_ENTERPRISE_PRICE_ID_SANDBOX`.
- El estado se mantiene en **NO GO para Live**.

## Implementación 11: endurecimiento final de paddle-webhook — 2026-07-26

- Extracción de `subscription_id` reforzada por tipo de evento, aceptando solo IDs con prefijo seguro `sub_`:
  - transacciones: `subscription_id` o `subscription.id`.
  - suscripciones: `data.id` (y variantes), siempre validando `sub_`.
- Control cronológico anti out-of-order alineado a `occurred_at`:
  - comparaciones contra `last_paddle_event_occurred_at`.
  - eventos no más recientes se marcan `applied` y se ignoran.
- `plan_status` en eventos de suscripción ahora respeta estados reales de Paddle desde `data.status`:
  - `active`, `trialing`, `past_due`, `paused -> inactive`, `canceled`.
  - estados desconocidos se rechazan antes de cualquier `upsert`.
- En `scheduled_change`, `cancel_at_period_end` solo queda `true` cuando `scheduled_change.action === "cancel"`.
  - `scheduled_change_action` y `scheduled_change_effective_at` se conservan para cualquier cambio programado.
- Endurecimiento criptográfico del webhook:
  - anti-replay por timestamp con tolerancia máxima de 5 minutos (300s, pasado o futuro).
  - comparación HMAC hexadecimal en tiempo constante y con validación de misma longitud.
- Se incorporaron explícitamente al bloque principal de suscripciones los eventos:
  - `subscription.activated`
  - `subscription.trialing`
  - `subscription.past_due`
  - `subscription.resumed`
  manteniendo `data.status` como fuente del estado final.
- Validación técnica aprobada en Preview: `deno fmt` y `deno check` aprobados.
- Alcance operativo: solo Preview, sin deploy y sin activación de Paddle Live.
- No se configuraron secretos de Paddle Live.
- El destino de notificaciones/webhook de Paddle Live no fue guardado.

## Estado de Go-Live

- Decisión: NO GO para Paddle en Live al 2026-07-23.
- Continuidad: Dodo se mantiene como proveedor principal vigente en Preview.
- Entorno permitido para Paddle: solo preview.

## Nota

Este documento resume el estado de readiness y la decisión de despliegue al 2026-07-23.
