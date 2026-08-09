# Billing reconcile v2 — arquitectura y contrato

Fecha: 2026-08-08
Estado: **implementado y desplegado en Preview; validación integral completada el 2026-08-09**

## Objetivo

`billing-reconcile` v2 define un proceso de reconciliación server-side para alinear `org_billing` con el estado real del proveedor externo cuando exista una discrepancia observada o sospechada.

El objetivo no es reemplazar los webhooks actuales, sino complementar el modelo existente con una vía explícita de reconciliación controlada, auditable y segura.

## Alcance

Esta arquitectura aplica a los tres proveedores soportados por la plataforma:

- Stripe
- Paddle
- DODO

El proceso debe poder ejecutarse en modo manual y, más adelante, en modo periódico.

## Principios obligatorios

- La reconciliación ocurre solo en server-side.
- El usuario nunca puede sobrescribir proveedor, IDs externos ni otros campos críticos de identidad.
- La invocación server-to-server del endpoint usa `apikey` validada contra `SUPABASE_SECRET_KEYS['default']` y habilita modo `server`.
- Si `SUPABASE_SECRET_KEYS` está ausente, vacío o es inválida, no se habilita modo `server` y el flujo deriva a autenticación de usuario.
- El endpoint opera con `verify_jwt=false` y delega la autorización al código: `apikey` para modo `server` y JWT con `requireOrgAdmin` para modo `user`.
- La autorización por organización para usuarios autenticados sigue validándose con `requireOrgAdmin` (`owner` o `admin`).
- En modo `user`, solo se permite `dry_run=true`; si llega `dry_run=false`, el endpoint responde `403`.
- `supabaseAdmin.ts` conserva `service_role` para operaciones internas de backend que requieren privilegios elevados.
- `dry_run` debe ser el modo seguro por defecto para la primera evaluación de cualquier cambio.
- Un error de API externa nunca debe causar un downgrade interno.
- No se deben modificar timestamps de evento del tipo `last_*_event_at` durante reconciliación.
- La reconciliación debe ser idempotente y trazable.

## Autorización

### Modo `server` por `apikey`

Cuando el request incluye `apikey` igual a `SUPABASE_SECRET_KEYS['default']`, el endpoint entra en modo `server`.

Si `SUPABASE_SECRET_KEYS` no existe, está malformada o no contiene una clave `default` válida, ese modo no se activa y la autorización cae al flujo de usuario autenticado.

### Usuario autenticado

Un usuario autenticado puede solicitar una reconciliación solo para su propia organización y solo dentro de las reglas que exponga el backend.

Este flujo exige que el usuario tenga rol `owner` o `admin` en la organización objetivo. Esta regla se mantiene y se valida con `requireOrgAdmin`.

Ese flujo debe estar restringido para que el usuario no pueda:

- elegir un provider arbitrario;
- inyectar IDs externos ajenos a su organización;
- forzar escrituras fuera del alcance permitido;
- ejecutar reconciliación con escritura (`dry_run=false`), caso en el que debe recibir `403`.

### Operaciones internas con `service_role`

`supabaseAdmin.ts` conserva el uso de `service_role` para operaciones internas de backend y automatizaciones confiables.

Este modo interno sí puede:

- consultar el proveedor real;
- comparar el estado externo con `org_billing`;
- aplicar la corrección mínima necesaria;
- registrar el resultado de la reconciliación.

## Modo `dry_run`

`dry_run` existe para validar la diferencia entre el estado interno y el externo sin escribir cambios.

Debe devolver, como mínimo:

- proveedor detectado o declarado;
- organización objetivo;
- estado actual en `org_billing`;
- estado observado en el proveedor;
- diferencias propuestas;
- decisión final esperada si se aplicara el cambio.

En `dry_run` no se modifica ninguna fila.

## Proveedores

### Stripe

Stripe puede seguir siendo reconciliado desde la fuente externa cuando el backend tenga suficiente contexto para identificar la suscripción y su estado real.

La reconciliación debe respetar las reglas ya existentes del flujo Stripe:

- `trial_ends_at` solo debe venir de Stripe cuando exista evidencia real en el proveedor;
- `current_period_end` debe preservarse o actualizarse solo si el proveedor aporta un valor confiable;
- un fallo al consultar Stripe no debe degradar el plan interno.

### Paddle

Paddle debe conservar su semántica actual, incluyendo el manejo de `scheduled_change_action` y `scheduled_change_effective_at`.

La reconciliación debe contemplar:

- estado actual de la suscripción;
- fecha efectiva de renovación o cancelación, cuando exista;
- `scheduled_change_action` y `scheduled_change_effective_at` como señales válidas para el estado futuro;
- preservación de la fuente interna si la API no responde.

### DODO

DODO debe reconciliarse usando el estado real de su suscripción o checkout relacionado, sin permitir que el frontend imponga el provider o el producto.

La reconciliación debe respetar:

- `plan_status` observado en el proveedor;
- `current_period_end` cuando exista y sea confiable;
- `cancel_at_period_end` cuando el proveedor lo exponga;
- no degradar el plan por errores transitorios de red o API.

## Campos permitidos de `org_billing`

La reconciliación v2 solo debe escribir campos que representen estado interno y vínculos validados con el proveedor.

Campos permitidos:

- `plan_code`
- `subscribed_plan_code`
- `plan_status`
- `current_period_end`
- `trial_ends_at` solo cuando Stripe lo justifique
- `cancel_at_period_end`
- `canceled_at`
- `billing_provider` solo cuando el backend confirme un cambio real o una normalización permitida
- `stripe_customer_id`
- `stripe_subscription_id`
- `stripe_price_id`
- `paddle_customer_id`
- `paddle_subscription_id`
- `paddle_price_id`
- `scheduled_change_action`
- `scheduled_change_effective_at`
- `dodo_customer_id`
- `dodo_subscription_id`
- `dodo_product_id`
- `updated_at`

## Campos prohibidos

La reconciliación no debe permitir que el usuario ni un flujo parcial sobreescriban campos de identidad o auditoría del evento.

Campos prohibidos o fuera de alcance para este contrato:

- cualquier `last_*_event_at`
- campos de evento crudos usados solo para auditoría interna
- IDs externos inventados por frontend
- provider distinto del detectado por backend
- cualquier campo sensible no relacionado con billing

## Regla de no-downgrade ante error

Si la consulta o la normalización del proveedor falla, el sistema debe conservar el estado interno actual.

Eso implica:

- no bajar de `active` a `free` por un timeout;
- no cambiar `plan_status` a un estado inferior solo por falta de respuesta;
- no borrar datos existentes si la API externa está temporalmente caída;
- preferir una salida conservadora con error explícito antes que una degradación incorrecta.

La única excepción aceptable es cuando el proveedor confirme explícitamente una condición de cancelación, expiración o inactividad.

## Flujo futuro periódico

La versión futura de este contrato prevé un job periódico de reconciliación para organizaciones elegibles.

Ese flujo debe operar así:

1. Seleccionar organizaciones con billing activo o recientemente cambiadas.
2. Resolver el proveedor real de cada organización.
3. Ejecutar una comprobación `dry_run` interna.
4. Si hay diferencia y la consulta externa es confiable, aplicar la corrección mínima necesaria.
5. Registrar resultado, estado y observaciones de manera auditable.

El job periódico debe respetar exactamente las mismas reglas de autorización y no-downgrade que la reconciliación manual.

## Relación con los webhooks actuales

`billing-reconcile` v2 no reemplaza a los webhooks.

Los webhooks siguen siendo el canal primario para capturar eventos en tiempo real. La reconciliación se reserva para:

- corregir desajustes entre proveedor y base interna;
- recuperar consistencia después de errores transitorios;
- verificar el estado real antes de automatizar un job periódico;
- soportar auditoría o soporte operativo.

## Criterio de aceptación funcional

Se considera correcto cuando:

- el backend puede reconciliar Stripe, Paddle y DODO sin permitir sobrescritura arbitraria de identidad;
- `dry_run` informa diferencias sin modificar datos;
- una falla de API no degrada el plan;
- Paddle conserva `scheduled_change`;
- ningún flujo de reconciliación escribe `last_*_event_at`;
- el diseño queda listo para evolucionar hacia un job periódico.
