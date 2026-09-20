# ENTERPRISE 100 — arquitectura y validación en Preview

Fecha: 2026-09-20. Rama: `preview`. Proyecto Supabase confirmado por el usuario: `mujwsfhkocsuuahlrssn` (pruebatugeo).

## Catálogo oficial

| Código | Nombre | Geocercas | Trackers | USD/mes |
|---|---|---:|---:|---:|
| free | Free | 1 | 2 | 0 |
| pro | Pro | 25 | 10 | 29 |
| enterprise | Enterprise | 250 | 50 | 99 |
| enterprise_100 | ENTERPRISE 100 | 250 | 100 | 169 |

`org_billing.plan_code` sigue siendo la fuente comercial. `public.plans` define límites; `organizations.plan` conserva su sincronización legacy por trigger. No se cambia ninguna organización de plan durante la migración.

## Auditoría y SQL

Se inspeccionaron columnas, restricciones, enum, dependencias, funciones, triggers, vista `org_entitlements`, políticas del catálogo y la tabla legacy `plan_entitlements` en la base real de Preview. Consulta reproducible: `supabase/sql/audit-enterprise-100-preview.sql`.

Migraciones aplicadas, en orden y con commits separados:

1. `20260920125854_enterprise_100_enum_preview.sql`: agrega el valor al enum existente, sin reconstruirlo ni eliminar valores.
2. `20260920130013_enterprise_100_catalog_preview.sql`: inserta el plan y actualiza normalización, preservación del plan pagado en auto-downgrade, ranking de Google Play y lectura de límites en `get_plan_entitlements`.

Los archivos SQL exigen `app.env = preview`. La ejecución autorizada usó `SET LOCAL app.env = 'preview'` únicamente dentro de la sesión/transacción dirigida al proyecto confirmado; no modificó ajustes persistentes. El marcador SQL por sí solo no identifica un proyecto: verificar siempre el project-ref antes de ejecutarlo. No ejecutar estos archivos automáticamente contra otras bases ni usar `supabase db push`.

`org_entitlements` ya hace join al catálogo y conserva `tracker_limit_override`; no requiere recreación. El trigger de sincronización legacy también es genérico y no requiere cambios. Las funciones de Google Play conservan los permisos exclusivos existentes de `postgres` y `service_role`. Ranking: free 0, pro 20, enterprise 30, enterprise_100 40.

La ruta legacy `get_plan_entitlements` tenía límites desalineados y caía a Free si faltaba una fila. Ahora los límites de todos los planes proceden de `org_entitlements`, incluidos overrides. Para ENTERPRISE 100 se copia la política de funcionalidades del plan pagado Pro existente (reportes/exportaciones/historial), sin inventar prestaciones nuevas. `max_members` se conserva como metadato legacy; la auditoría no encontró funciones que lo apliquen. No modifica el límite canónico de trackers.

## Paddle Sandbox

Se conserva el producto SaaS existente `pro_01kpgax6299ygyfa7k4atdksyv`. Se agregó un precio recurrente mensual, USD 169, nombre comercial ENTERPRISE 100, sin trial, cantidad 1 y categoría fiscal SaaS heredada; impuestos según el ajuste de cuenta existente.

- Price ID Sandbox: `pri_01m2zypgfpcw09kz1epgmdrwpz`.
- Custom data: `plan_code = enterprise_100`.
- Supabase Preview: `PADDLE_ENTERPRISE_100_PRICE_ID_SANDBOX` configurado con ese ID.
- Vercel: `VITE_ENTERPRISE_100_CHECKOUT_ENABLED=true` solo en entorno Preview y rama `preview`.
- No se creó precio Live ni se configuraron variables de Producción.

Checkout, cambio de plan, webhook y reconciliación reconocen el ID propio. Sin ID configurado fallan explícitamente; nunca reutilizan el precio de Enterprise. El checkout rechaza nuevas suscripciones cuando la organización ya tiene un plan pagado activo: debe usarse cambio de plan. Pro → Enterprise, Pro → ENTERPRISE 100 y Enterprise → ENTERPRISE 100 actualizan la suscripción existente; no permiten bajar de nivel por este endpoint. Se mantienen autorización por organización, bloqueo de cancelaciones/cambios pendientes, prorrateo y `prevent_change` ante fallo del pago.

Las funciones locales y desplegadas tenían diferencias anteriores a esta tarea. Se conservaron los diagnósticos de error del checkout desplegado. El webhook local tenía correcciones de firma, estados e idempotencia; se adaptó al esquema real de Preview: usa `last_paddle_event_at` y el registro `paddle_webhook_events`, sin escribir columnas inexistentes. Preserva overrides existentes en lugar de asignar límites fijos o borrarlos.

Funciones desplegadas únicamente en Preview: `paddle-create-checkout`, `paddle-change-plan`, `paddle-webhook`, `billing-reconcile`. Se conservaron las configuraciones de JWT; webhook usa firma Paddle y reconciliación su autorización existente.

## Aplicación y otros proveedores

`src/config/pricing.ts` centraliza presentación, ranking y límites de fallback. El catálogo de base sigue siendo la fuente operacional. Se actualizaron las rutas activas de precios, inicio, billing, landing y etiquetas de trackers/geocercas. ENTERPRISE 100 hereda la clasificación de funcionalidades Enterprise. Se añadieron traducciones ES/EN/FR y confirmación de upgrade con nombre/precio del destino.

Los adaptadores Dodo existentes reconocen el código en el repositorio y exigen IDs propios por entorno. No se crearon productos ni se desplegaron cambios Dodo, ya que Paddle es el proveedor activo. Google Play reconoce el nuevo código en su enum/ranking; no se inventó un producto de Play ni se modificó Android. Stripe es legacy y no se amplió su catálogo. `Pricing.jsx` y `Billing.tsx` no son las rutas activas de la aplicación; el router usa `PublicPricing.jsx` y `Billing.jsx`. Los helpers de límites antiguos no invocados en `api/accept-tracker-invite.js` no participan en la aceptación transaccional actual.

## Verificación

- Build Vite completado.
- Pruebas existentes de permisos/invitaciones: 15 aprobadas; prueba adicional de ENTERPRISE 100 aprobada con límites 100/250 y overrides 0/75.
- `deno check`: funciones Paddle, reconciliación y adaptadores Dodo sin errores.
- `node scripts/test-enterprise-100-payments.mjs` (Node 24): mappings de precio, precio ausente/desconocido, ranking, upgrades Pro/Enterprise, rechazo de downgrade, autenticación y cancelación pendiente. No realiza pagos externos.
- `supabase/sql/verify-enterprise-100-preview.sql`: prueba con rollback de límites 100/250, rechazo 101/251, sincronización legacy, overrides 75/0, estado activo/inactivo y Google Play activo/vencido. Pasó antes de confirmar la migración. No deja datos de prueba.
- Verificación posterior: 14 organizaciones y 14 registros billing, overrides intactos, cero organizaciones migradas al plan nuevo, cero productos temporales, cuatro planes correctos y permisos Play conservados.
- Se consultó Supabase Security Advisor; existen avisos de seguridad generales fuera del alcance. No se ampliaron permisos ni se desactivó RLS.

Pendiente de validación comercial: completar checkout Sandbox desde una organización de prueba, recepción del webhook, upgrade de suscripción existente y confirmación visual de billing. Las pruebas simuladas y SQL no equivalen a una compra de extremo a extremo.

## Operación y reversión

Solo `preview`; no push a `main`, Promote to Production, migraciones de Producción ni ejecución/traslado de DEMO. Mantener separados los IDs Sandbox/Live. Para pausar nuevas ventas, deshabilitar el flag de checkout en Vercel Preview y redesplegar Preview; conservar enum y catálogo si ya existen suscripciones. No eliminar valores enum ni cambiar organizaciones automáticamente.

Para revisar con Copilot, abrir este archivo y usar el prompt corto: «Contrasta este documento con el diff de enterprise_100. Corrige solo inconsistencias verificables de documentación; no modifiques código, SQL ni entornos».

## Revisión del despliegue Preview

El despliegue del commit `71c0270` quedó READY en Vercel Preview. La revisión visual detectó textos heredados de límites en la portada; ahora los cuatro planes muestran los valores de `PLAN_LIMITS`, con una plantilla traducida ES/EN/FR y los nombres oficiales. Se mantiene pendiente la compra completa Sandbox descrita arriba.

La migración adicional 20260920224410 cierra el caso sin fila de entitlements: los límites ausentes son 0, nunca NULL (ilimitado para consumidores legacy). Verificado en Preview con una organización inexistente: 0 trackers y 0 geocercas. Los cuatro planes conservan sus límites oficiales.
