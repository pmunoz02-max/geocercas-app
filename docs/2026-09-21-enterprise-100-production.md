# ENTERPRISE 100 — Producción / Paddle Live

Fecha UTC: 2026-09-21. Autorización explícita del usuario: «implementemos enterprise_100 en Produccion, Paddle Vendors».

## Alcance y arquitectura

Proyecto Supabase exclusivo: `wpaixkvokdkudymgjoua` (My Project). Se mantiene la rama `preview`, sin push a `main`. No se copiaron claves, datos DEMO ni migraciones generales de Preview.

| Código | Geocercas | Trackers | USD/mes |
|---|---:|---:|---:|
| free | 1 | 2 | 0 |
| pro | 25 | 10 | 29 |
| enterprise | 250 | 50 | 99 |
| enterprise_100 | 250 | 100 | 169 |

La auditoría real confirmó `org_billing.plan_code` como fuente comercial, catálogo `public.plans` y vista `org_entitlements` con overrides. A diferencia de Preview, Producción no tiene `play_products`, `plan_entitlements` ni `billing-reconcile`. No se crearon esos componentes. Sus límites operativos y auto-downgrade ya son genéricos. El trigger de sincronización tenía whitelist fija; ahora valida la existencia del código en el catálogo.

SQL específico versionado en `supabase/production-releases/enterprise-100/`, fuera de las migraciones automáticas de Preview:

- `01-enum.sql`: aplicado como `20260921042515_enterprise_100_enum_production`.
- `02-catalog.sql`: aplicado como `20260921042524_enterprise_100_catalog_production`.

El enum se confirmó en una transacción separada antes de insertar el plan. No se reconstruyó el enum ni se cambiaron permisos/RLS. No usar `supabase db push` para aplicar estos archivos.

## Paddle Live

- Producto: `pro_01m313mrc72sw0ew1wwc47ba15`, nombre ENTERPRISE 100.
- Precio: `pri_01m313pj87wrkye7anyf2q98tm`, USD 169 recurrente mensual.
- Sin trial; cantidad mínima/máxima 1. Impuestos según configuración de cuenta.
- Categoría: Standard digital goods, igual que los productos existentes de Live. No se modificaron sus categorías ni precios.
- Custom data del producto/precio: `plan_code=enterprise_100`.
- Supabase Producción: `PADDLE_ENTERPRISE_100_PRICE_ID_LIVE` configurado. Se verificó por huella que `PADDLE_ENV` corresponde a `live`.
- Vercel Production: `VITE_ENTERPRISE_100_CHECKOUT_ENABLED=true`.

El catálogo Live existente separa productos Pro y Enterprise. Se agregó un producto independiente manteniendo esa estructura; no se reutiliza el producto ni el precio de Sandbox.

## Backend y publicación

Funciones Production desplegadas: `paddle-create-checkout` v41, `paddle-change-plan` v6 y `paddle-webhook` v42. Se mantuvo JWT en checkout/cambio; webhook conserva validación de firma y deduplicación.

El webhook Production parte de su versión desplegada v41, ampliada para el nuevo precio y conservación de overrides. Conserva `last_paddle_event_at`, `last_paddle_event_occurred_at`, `last_paddle_event_id` y `last_paddle_event_type`, que sí existen en esta base. Un fallo de lectura del billing existente rechaza el evento para poder reintentarlo sin borrar overrides. No desplegar ciegamente el webhook Preview sobre Producción.

Código exacto de funciones y prueba aislada: `supabase/production-releases/enterprise-100/functions/` y `test-payments.mjs`. La prueba usa datos ficticios en memoria y no realiza llamadas a Paddle.

Se solicitó Promote desde el deployment Preview `geocercas-app-v3-k9105ic9f-pietros-projects-338208c7.vercel.app`, commit `45e92b23`. Respecto al commit Production anterior `e02db3f1`, el diff contiene únicamente los dos commits de ENTERPRISE 100. Vercel creó el deployment Production `9bCMwKCRjXLjp9YSkFL7T3F1omAb` con reconstrucción del entorno Production. El resultado visual se registra tras verificarlo.

## Verificación y límites de las pruebas

- `deno check` pasó para las tres funciones Production.
- Pruebas Node 24 pasaron: IDs Live, precio ausente/desconocido, upgrades desde Pro/Enterprise, rechazo de downgrade, autenticación, cancelación pendiente, bloqueo de suscripción duplicada, webhook firmado y rechazo sin firma. Se conservaron los campos de auditoría y override 75.
- Prueba SQL transaccional con ROLLBACK: límites 100/250, sincronización legacy, conservación del plan activo, cancelación a Free, overrides 0 y 75. No dejó cambios de prueba.
- Las 13 organizaciones billing conservan la distribución anterior: 9 Free/free, 2 Pro/active, 1 Pro/trialing, 1 Enterprise/active; cero overrides y cero organizaciones movidas al plan nuevo.
- Security Advisor consultado: hay avisos generales de la base fuera del alcance; no equivale a una auditoría de seguridad limpia.
- Pendiente: compra real y webhook de un cobro real, que no se ejecutan como prueba automática. Tampoco se cambió ninguna suscripción existente.

## Reversión operativa

Para suspender ventas nuevas, deshabilitar el flag y reconstruir Production. Conservar catálogo/enum y el reconocimiento del nuevo precio si existen suscripciones. No borrar el plan ni migrar organizaciones automáticamente. El deployment anterior permanece disponible para una reversión coordinada; no revertir el backend a una versión que desconozca suscripciones ENTERPRISE 100 activas.

Para revisión con Copilot, abrir este documento: «Contrasta el documento con el paquete enterprise-100 de production-releases. Corrige solo diferencias verificables; no ejecutes SQL ni despliegues».

## Resultado de publicación
Deployment Production READY: geocercas-app-v3-fpiofgdfv-pietros-projects-338208c7.vercel.app, commit 45e92b2375f6ccc79c8dbb9be7a7b92d2b60aa87. Verificación visual en https://app.tugeocercas.com/pricing: Live checkout, ENTERPRISE 100 USD 169, 100 trackers y 250 geocercas, botón habilitado. La sesión existente conserva Enterprise como plan actual. No se pulsó confirmación de pago ni se alteró su suscripción.
